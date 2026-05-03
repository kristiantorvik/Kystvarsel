import { getDb } from './db';
import type { MapLayer, Splat } from '../domain/layerTypes';
import { isColorId, type ColorId } from '../domain/palette';
import { computeEraseDiff } from '../domain/eraseLogic';
import { newId } from '../utils/uuid';

interface LayerRow {
  id: string;
  name: string;
  color_id: string;
  visible: number;
  position: number;
  created_at: string;
  updated_at: string;
}

interface SplatRow {
  id: number;
  layer_id: string;
  lat: number;
  lon: number;
  radius_m: number;
}

function toLayer(r: LayerRow): MapLayer {
  return {
    id: r.id,
    name: r.name,
    // Coerce: if a saved layer's color_id was retired without a migration,
    // fall back to c1 so we never crash on render.
    colorId: isColorId(r.color_id) ? (r.color_id as ColorId) : 'c1',
    visible: r.visible !== 0,
    position: r.position,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toSplat(r: SplatRow): Splat {
  return {
    id: r.id,
    layerId: r.layer_id,
    lat: r.lat,
    lon: r.lon,
    radiusM: r.radius_m,
  };
}

/**
 * Max splats per chunked bulk INSERT. Each splat takes 4 parameters
 * (layer_id, lat, lon, radius_m); 200 × 4 = 800, comfortably under
 * SQLite's default 999-parameter limit. Bulk multi-row INSERTs are 5–10×
 * faster than per-row INSERTs in the same transaction; this is what
 * keeps complex erase strokes feeling snappy after recursive subdivision
 * produces hundreds of replacement splats.
 */
const BULK_INSERT_CHUNK_SIZE = 200;

async function bulkInsertSplats(
  db: Awaited<ReturnType<typeof getDb>>,
  layerId: string,
  splats: Array<{ lat: number; lon: number; radiusM: number }>,
): Promise<number[]> {
  if (splats.length === 0) return [];
  const ids: number[] = [];
  for (let i = 0; i < splats.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = splats.slice(i, i + BULK_INSERT_CHUNK_SIZE);
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(',');
    const params: Array<string | number> = [];
    for (const s of chunk) params.push(layerId, s.lat, s.lon, s.radiusM);
    const result = await db.runAsync(
      `INSERT INTO layer_splats (layer_id, lat, lon, radius_m) VALUES ${placeholders}`,
      ...params,
    );
    // SQLite assigns sequential rowids inside a transaction (no concurrent
    // writers on the same connection), so we can reconstruct each row's ID
    // from the chunk's lastInsertRowId. Avoids a SELECT round-trip.
    const lastId = result.lastInsertRowId;
    for (let j = 0; j < chunk.length; j++) {
      ids.push(lastId - chunk.length + 1 + j);
    }
  }
  return ids;
}

export const layersRepository = {
  async list(): Promise<MapLayer[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<LayerRow>(
      'SELECT * FROM map_layers ORDER BY position ASC, created_at ASC',
    );
    return rows.map(toLayer);
  },

  async get(id: string): Promise<MapLayer | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<LayerRow>(
      'SELECT * FROM map_layers WHERE id = ?',
      id,
    );
    return row ? toLayer(row) : null;
  },

  async create(input: {
    name: string;
    colorId: ColorId;
    position?: number;
    visible?: boolean;
  }): Promise<MapLayer> {
    const db = await getDb();
    const now = new Date().toISOString();
    // Default position to "after all existing" so new layers stack on top.
    const positionRow = await db.getFirstAsync<{ max: number | null }>(
      'SELECT MAX(position) AS max FROM map_layers',
    );
    const position = input.position ?? (positionRow?.max ?? -1) + 1;
    const layer: MapLayer = {
      id: newId(),
      name: input.name,
      colorId: input.colorId,
      visible: input.visible ?? true,
      position,
      createdAt: now,
      updatedAt: now,
    };
    await db.runAsync(
      `INSERT INTO map_layers (id, name, color_id, visible, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      layer.id,
      layer.name,
      layer.colorId,
      layer.visible ? 1 : 0,
      layer.position,
      layer.createdAt,
      layer.updatedAt,
    );
    return layer;
  },

  async update(layer: MapLayer): Promise<MapLayer> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE map_layers SET name = ?, color_id = ?, visible = ?, position = ?, updated_at = ?
       WHERE id = ?`,
      layer.name,
      layer.colorId,
      layer.visible ? 1 : 0,
      layer.position,
      updatedAt,
      layer.id,
    );
    return { ...layer, updatedAt };
  },

  async setVisible(id: string, visible: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE map_layers SET visible = ?, updated_at = ? WHERE id = ?',
      visible ? 1 : 0,
      new Date().toISOString(),
      id,
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    // ON DELETE CASCADE on layer_splats handles the related rows.
    await db.runAsync('DELETE FROM map_layers WHERE id = ?', id);
  },

  async countSplats(layerId: string): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM layer_splats WHERE layer_id = ?',
      layerId,
    );
    return row?.n ?? 0;
  },

  async listSplats(layerId: string): Promise<Splat[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<SplatRow>(
      'SELECT * FROM layer_splats WHERE layer_id = ?',
      layerId,
    );
    return rows.map(toSplat);
  },

  /**
   * Read splats for many layers in a single SELECT, replacing the previous
   * N+1 pattern (`list().forEach(listSplats)`). Returns a map keyed by
   * layer id; layers with no splats get an empty array.
   */
  async listSplatsForLayers(layerIds: string[]): Promise<Map<string, Splat[]>> {
    const result = new Map<string, Splat[]>();
    for (const id of layerIds) result.set(id, []);
    if (layerIds.length === 0) return result;
    const db = await getDb();
    const placeholders = layerIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<SplatRow>(
      `SELECT * FROM layer_splats WHERE layer_id IN (${placeholders})`,
      ...layerIds,
    );
    for (const r of rows) {
      const list = result.get(r.layer_id);
      if (list) list.push(toSplat(r));
    }
    return result;
  },

  /**
   * Insert a batch of splats in a single transaction, using chunked bulk
   * INSERTs. Returns the row IDs of the inserted splats so callers can
   * later remove them (used by undo).
   */
  async addSplats(
    layerId: string,
    splats: Array<{ lat: number; lon: number; radiusM: number }>,
  ): Promise<number[]> {
    if (splats.length === 0) return [];
    const db = await getDb();
    let ids: number[] = [];
    await db.withTransactionAsync(async () => {
      ids = await bulkInsertSplats(db, layerId, splats);
    });
    return ids;
  },

  /** Remove specific splat rows by id. Used by undo. */
  async removeSplatsByIds(layerId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `DELETE FROM layer_splats WHERE layer_id = ? AND id IN (${placeholders})`,
      layerId,
      ...ids,
    );
  },

  /**
   * Apply a whole erase stroke (a list of eraser positions) in a single DB
   * transaction. The geometric work — recursive subdivision around the
   * cuts and the multi-eraser working set — lives in
   * {@link computeEraseDiff}, which is pure and unit-tested. This method
   * is the I/O wrapper.
   *
   * Returns enough information to undo the stroke:
   *   - `deletedCount`: how many original splats were removed (for UX)
   *   - `removedSplats`: the splat data we deleted (so undo can re-insert)
   *   - `insertedIds`: row IDs of subdivision replacements (so undo can
   *     delete them)
   */
  async eraseBatch(
    layerId: string,
    erasers: Array<{ lat: number; lon: number; radiusM: number }>,
  ): Promise<{
    deletedCount: number;
    removedSplats: Splat[];
    insertedSplats: Splat[];
  }> {
    if (erasers.length === 0) {
      return { deletedCount: 0, removedSplats: [], insertedSplats: [] };
    }
    const db = await getDb();
    const rows = await db.getAllAsync<SplatRow>(
      'SELECT * FROM layer_splats WHERE layer_id = ?',
      layerId,
    );
    const diff = computeEraseDiff(
      rows.map((r) => ({ id: r.id, lat: r.lat, lon: r.lon, radiusM: r.radius_m })),
      erasers,
    );

    if (diff.toDelete.length === 0 && diff.toInsert.length === 0) {
      return { deletedCount: 0, removedSplats: [], insertedSplats: [] };
    }

    const insertedSplats: Splat[] = [];
    await db.withTransactionAsync(async () => {
      if (diff.toDelete.length > 0) {
        const placeholders = diff.toDelete.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM layer_splats WHERE id IN (${placeholders})`,
          ...diff.toDelete,
        );
      }
      const insertedIds = await bulkInsertSplats(db, layerId, diff.toInsert);
      for (let i = 0; i < diff.toInsert.length; i++) {
        const s = diff.toInsert[i];
        insertedSplats.push({
          id: insertedIds[i],
          layerId,
          lat: s.lat,
          lon: s.lon,
          radiusM: s.radiusM,
        });
      }
    });

    return {
      deletedCount: diff.toDelete.length,
      removedSplats: diff.removedSplats.map<Splat>((s) => ({
        id: s.id,
        layerId,
        lat: s.lat,
        lon: s.lon,
        radiusM: s.radiusM,
      })),
      insertedSplats,
    };
  },

  /**
   * Convenience wrapper: erase a single point. Mostly useful in tests; the
   * paint screen always uses {@link eraseBatch}.
   */
  async eraseAt(
    layerId: string,
    lat: number,
    lon: number,
    eraserRadiusM: number,
  ): Promise<number> {
    const r = await this.eraseBatch(layerId, [{ lat, lon, radiusM: eraserRadiusM }]);
    return r.deletedCount;
  },

  async clearSplats(layerId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM layer_splats WHERE layer_id = ?', layerId);
  },
};
