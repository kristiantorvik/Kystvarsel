import { getDb } from './db';
import { newId } from '../utils/uuid';
import { isColorId, type ColorId } from '../domain/palette';
import type { Tag, TagWithCount } from '../domain/tagTypes';

interface TagRow {
  id: string;
  name: string;
  color_id: string;
  created_at: string;
  updated_at: string;
}

function toTag(r: TagRow): Tag {
  return {
    id: r.id,
    name: r.name,
    // Defensive coercion — same pattern as layers, in case a stored color_id
    // is ever retired without a migration.
    colorId: isColorId(r.color_id) ? (r.color_id as ColorId) : 'c1',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Thrown when a write would create two tags with the same name. Caught at
 * the form layer to show a friendly message instead of an opaque SQLite
 * UNIQUE-constraint error.
 */
export class DuplicateTagNameError extends Error {
  constructor(name: string) {
    super(`Tag "${name}" already exists`);
    this.name = 'DuplicateTagNameError';
  }
}

function isUniqueConstraintError(e: unknown): boolean {
  // expo-sqlite surfaces SQLite errors via Error.message containing the
  // canonical "UNIQUE constraint failed" text. Cheaper than catching a
  // typed error class (which expo-sqlite doesn't expose).
  return e instanceof Error && /UNIQUE constraint failed/i.test(e.message);
}

export const tagsRepository = {
  async list(): Promise<Tag[]> {
    const db = await getDb();
    // Order by name so the chip row is alphabetically scannable. Names are
    // user-typed Norwegian — locale collation would be nicer but SQLite's
    // default works well enough for ASCII + ÆØÅ.
    const rows = await db.getAllAsync<TagRow>(
      'SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC',
    );
    return rows.map(toTag);
  },

  /**
   * Tags with their attached-spot counts in a single query. Used by
   * `TagsListView` (so the user sees how many spots each tag covers) and
   * by the filter chip row (so users can see which tags are populated).
   */
  async listWithCounts(): Promise<TagWithCount[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<TagRow & { spot_count: number }>(
      `SELECT t.*, COALESCE(c.n, 0) AS spot_count
       FROM tags t
       LEFT JOIN (
         SELECT tag_id, COUNT(*) AS n FROM spot_tags GROUP BY tag_id
       ) c ON c.tag_id = t.id
       ORDER BY t.name COLLATE NOCASE ASC`,
    );
    return rows.map((r) => ({ ...toTag(r), spotCount: r.spot_count }));
  },

  async get(id: string): Promise<Tag | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<TagRow>(
      'SELECT * FROM tags WHERE id = ?',
      id,
    );
    return row ? toTag(row) : null;
  },

  async create(input: { name: string; colorId: ColorId }): Promise<Tag> {
    const db = await getDb();
    const now = new Date().toISOString();
    const tag: Tag = {
      id: newId(),
      name: input.name.trim(),
      colorId: input.colorId,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.runAsync(
        `INSERT INTO tags (id, name, color_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        tag.id,
        tag.name,
        tag.colorId,
        tag.createdAt,
        tag.updatedAt,
      );
    } catch (e) {
      if (isUniqueConstraintError(e)) throw new DuplicateTagNameError(tag.name);
      throw e;
    }
    return tag;
  },

  async update(tag: Tag): Promise<Tag> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    try {
      await db.runAsync(
        `UPDATE tags SET name = ?, color_id = ?, updated_at = ? WHERE id = ?`,
        tag.name.trim(),
        tag.colorId,
        updatedAt,
        tag.id,
      );
    } catch (e) {
      if (isUniqueConstraintError(e)) throw new DuplicateTagNameError(tag.name);
      throw e;
    }
    return { ...tag, updatedAt };
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    // ON DELETE CASCADE on spot_tags handles the join table.
    await db.runAsync('DELETE FROM tags WHERE id = ?', id);
  },

  /**
   * Replace the full tag set for a spot. Caller passes the desired tag
   * IDs; we diff against current attachments to insert what's new and
   * delete what's gone, in a single transaction. Idempotent.
   */
  async setTagsForSpot(spotId: string, tagIds: string[]): Promise<void> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      const existing = await db.getAllAsync<{ tag_id: string }>(
        'SELECT tag_id FROM spot_tags WHERE spot_id = ?',
        spotId,
      );
      const existingSet = new Set(existing.map((r) => r.tag_id));
      const desiredSet = new Set(tagIds);

      const toAdd: string[] = [];
      const toRemove: string[] = [];
      for (const id of desiredSet) if (!existingSet.has(id)) toAdd.push(id);
      for (const id of existingSet) if (!desiredSet.has(id)) toRemove.push(id);

      for (const id of toAdd) {
        await db.runAsync(
          'INSERT OR IGNORE INTO spot_tags (spot_id, tag_id) VALUES (?, ?)',
          spotId,
          id,
        );
      }
      if (toRemove.length > 0) {
        const placeholders = toRemove.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM spot_tags WHERE spot_id = ? AND tag_id IN (${placeholders})`,
          spotId,
          ...toRemove,
        );
      }
    });
  },

  /** Tag IDs attached to a single spot. Ordered by tag name. */
  async listTagIdsForSpot(spotId: string): Promise<string[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<{ tag_id: string }>(
      `SELECT st.tag_id FROM spot_tags st
       JOIN tags t ON t.id = st.tag_id
       WHERE st.spot_id = ?
       ORDER BY t.name COLLATE NOCASE ASC`,
      spotId,
    );
    return rows.map((r) => r.tag_id);
  },

  /**
   * Bulk version: tag IDs for many spots in one query. Returns a map
   * keyed by spot id; spots with no tags get an empty array. Used by
   * SpotsListScreen to render tag chips on every row without N+1.
   */
  async listTagIdsForSpots(spotIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    for (const id of spotIds) result.set(id, []);
    if (spotIds.length === 0) return result;
    const db = await getDb();
    const placeholders = spotIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<{ spot_id: string; tag_id: string }>(
      `SELECT st.spot_id, st.tag_id FROM spot_tags st
       JOIN tags t ON t.id = st.tag_id
       WHERE st.spot_id IN (${placeholders})
       ORDER BY t.name COLLATE NOCASE ASC`,
      ...spotIds,
    );
    for (const r of rows) {
      const list = result.get(r.spot_id);
      if (list) list.push(r.tag_id);
    }
    return result;
  },
};
