import Constants from 'expo-constants';

import { spotsRepository } from './spotsRepository';
import { alertsRepository } from './alertsRepository';
import { layersRepository } from './layersRepository';
import { getDb } from './db';
import type { Alert, Spot } from '../domain/alertTypes';
import type { MapLayer, SerializedSplat } from '../domain/layerTypes';
import { isColorId, type ColorId } from '../domain/palette';

/**
 * On-disk JSON schema for full app exports.
 *
 * Versioning policy: bump `schemaVersion` whenever a field is renamed or
 * removed in a way that older code can't read. Additive changes (new optional
 * fields) don't require a bump — the parser ignores unknown fields.
 *
 *   1 — spots + alerts (layers reserved as empty array)
 *   2 — Phase 4: layers populated with { meta, splats[] }
 */
export const CURRENT_SCHEMA_VERSION = 2;

/** Layer + its splats, as they appear in the export JSON. */
export interface SerializedLayer {
  id: string;
  name: string;
  colorId: ColorId;
  visible: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
  splats: SerializedSplat[];
}

export interface ExportPayload {
  /** App version that produced the export, for diagnostics. */
  kystvarselVersion: string;
  schemaVersion: number;
  exportedAtUtc: string;
  spots: Spot[];
  alerts: Alert[];
  layers: SerializedLayer[];
}

export type ImportMode = 'replace' | 'merge';

export interface ImportSummary {
  spotsImported: number;
  spotsSkipped: number;
  alertsImported: number;
  alertsSkipped: number;
  layersImported: number;
  layersSkipped: number;
  splatsImported: number;
}

export type ParseResult =
  | { ok: true; payload: ExportPayload }
  | { ok: false; reason: 'malformed' | 'wrongType' | 'unsupportedVersion'; detail?: string };

/** Read every user-owned table and assemble a portable JSON payload. */
export async function buildExport(): Promise<ExportPayload> {
  const [spots, alerts, layers] = await Promise.all([
    spotsRepository.list(),
    alertsRepository.list(),
    layersRepository.list(),
  ]);
  // Pull splats per layer in parallel — typically a handful of layers, fast.
  const serializedLayers: SerializedLayer[] = await Promise.all(
    layers.map(async (l) => ({
      id: l.id,
      name: l.name,
      colorId: l.colorId,
      visible: l.visible,
      position: l.position,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      splats: (await layersRepository.listSplats(l.id)).map((s) => ({
        lat: s.lat,
        lon: s.lon,
        radiusM: s.radiusM,
      })),
    })),
  );
  return {
    kystvarselVersion: Constants.expoConfig?.version ?? '0.0.0',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAtUtc: new Date().toISOString(),
    spots,
    alerts,
    layers: serializedLayers,
  };
}

/** Default filename for export — easy to recognise in the user's file manager. */
export function defaultExportFilename(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `kystvarsel-eksport-${yyyy}-${mm}-${dd}-${hh}${min}.json`;
}

/**
 * Validate a raw JSON string and return a typed payload (or a structured
 * error suitable for showing to the user). We don't trust the input — every
 * required field is checked and shape-coerced where reasonable.
 */
export function parseImport(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'malformed', detail: e instanceof Error ? e.message : String(e) };
  }
  if (!isObject(raw)) {
    return { ok: false, reason: 'wrongType', detail: 'top-level must be an object' };
  }
  const { schemaVersion, spots, alerts } = raw;
  if (typeof schemaVersion !== 'number') {
    return { ok: false, reason: 'wrongType', detail: 'missing schemaVersion' };
  }
  if (schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupportedVersion', detail: `file is v${schemaVersion}, app is v${CURRENT_SCHEMA_VERSION}` };
  }
  if (!Array.isArray(spots)) {
    return { ok: false, reason: 'wrongType', detail: 'spots must be an array' };
  }
  if (!Array.isArray(alerts)) {
    return { ok: false, reason: 'wrongType', detail: 'alerts must be an array' };
  }

  const cleanSpots: Spot[] = [];
  for (const s of spots) {
    const v = coerceSpot(s);
    if (v) cleanSpots.push(v);
  }
  const cleanAlerts: Alert[] = [];
  for (const a of alerts) {
    const v = coerceAlert(a);
    if (v) cleanAlerts.push(v);
  }

  // Layers are optional — schema v1 imports won't have them.
  const rawLayers = Array.isArray((raw as { layers?: unknown }).layers)
    ? (raw as { layers: unknown[] }).layers
    : [];
  const cleanLayers: SerializedLayer[] = [];
  for (const l of rawLayers) {
    const v = coerceLayer(l);
    if (v) cleanLayers.push(v);
  }

  return {
    ok: true,
    payload: {
      kystvarselVersion: typeof (raw as { kystvarselVersion?: unknown }).kystvarselVersion === 'string'
        ? (raw as { kystvarselVersion: string }).kystvarselVersion
        : 'unknown',
      schemaVersion,
      exportedAtUtc: typeof (raw as { exportedAtUtc?: unknown }).exportedAtUtc === 'string'
        ? (raw as { exportedAtUtc: string }).exportedAtUtc
        : new Date().toISOString(),
      spots: cleanSpots,
      alerts: cleanAlerts,
      layers: cleanLayers,
    },
  };
}

/**
 * Apply a parsed payload to the local database.
 *
 *   replace — wipe spots + alerts + (later) layers, then insert from payload.
 *             Forecast cache is left alone (refetches naturally).
 *   merge   — insert spots not already present (matched by id), then alerts
 *             whose spotId resolves to a known spot. Existing rows are kept
 *             unchanged. Conflict count is reported via `*Skipped`.
 *
 * All writes happen inside a single transaction so a failure mid-import
 * doesn't leave the database half-converted.
 */
export async function applyImport(
  payload: ExportPayload,
  mode: ImportMode,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    spotsImported: 0,
    spotsSkipped: 0,
    alertsImported: 0,
    alertsSkipped: 0,
    layersImported: 0,
    layersSkipped: 0,
    splatsImported: 0,
  };

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      // ON DELETE CASCADE on alerts.spot_id removes alerts automatically,
      // but we delete alerts explicitly first for clarity in case the
      // foreign-key cascade is ever turned off. Same applies to layer_splats.
      await db.runAsync('DELETE FROM alerts');
      await db.runAsync('DELETE FROM spots');
      await db.runAsync('DELETE FROM layer_splats');
      await db.runAsync('DELETE FROM map_layers');
    }

    const existingSpotIds = new Set<string>(
      (await db.getAllAsync<{ id: string }>('SELECT id FROM spots')).map((r) => r.id),
    );

    for (const spot of payload.spots) {
      if (existingSpotIds.has(spot.id)) {
        summary.spotsSkipped += 1;
        continue;
      }
      await db.runAsync(
        `INSERT INTO spots (id, name, latitude, longitude, comment, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        spot.id,
        spot.name,
        spot.latitude,
        spot.longitude,
        spot.comment ?? null,
        spot.createdAt,
        spot.updatedAt,
      );
      existingSpotIds.add(spot.id);
      summary.spotsImported += 1;
    }

    const existingAlertIds = new Set<string>(
      (await db.getAllAsync<{ id: string }>('SELECT id FROM alerts')).map((r) => r.id),
    );

    for (const alert of payload.alerts) {
      if (existingAlertIds.has(alert.id)) {
        summary.alertsSkipped += 1;
        continue;
      }
      // Don't import alerts whose target spot got skipped (or never existed).
      if (!existingSpotIds.has(alert.spotId)) {
        summary.alertsSkipped += 1;
        continue;
      }
      await db.runAsync(
        `INSERT INTO alerts (id, spot_id, name, message, enabled,
                             time_of_day_start, time_of_day_end, criteria_json,
                             created_at, updated_at,
                             last_triggered_at, last_triggered_window_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        alert.id,
        alert.spotId,
        alert.name,
        alert.message,
        alert.enabled ? 1 : 0,
        alert.timeOfDayStart,
        alert.timeOfDayEnd,
        JSON.stringify(alert.criteria ?? {}),
        alert.createdAt,
        alert.updatedAt,
        alert.lastTriggeredAt ?? null,
        alert.lastTriggeredWindowHash ?? null,
      );
      existingAlertIds.add(alert.id);
      summary.alertsImported += 1;
    }

    const existingLayerIds = new Set<string>(
      (await db.getAllAsync<{ id: string }>('SELECT id FROM map_layers')).map((r) => r.id),
    );

    for (const layer of payload.layers) {
      if (existingLayerIds.has(layer.id)) {
        summary.layersSkipped += 1;
        continue;
      }
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
      existingLayerIds.add(layer.id);
      summary.layersImported += 1;

      for (const s of layer.splats) {
        await db.runAsync(
          'INSERT INTO layer_splats (layer_id, lat, lon, radius_m) VALUES (?, ?, ?, ?)',
          layer.id,
          s.lat,
          s.lon,
          s.radiusM,
        );
        summary.splatsImported += 1;
      }
    }
  });

  return summary;
}

// ----- private coercion helpers -----

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function coerceSpot(raw: unknown): Spot | null {
  if (!isObject(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const lat = raw.latitude;
  const lon = raw.longitude;
  if (typeof id !== 'string' || !id) return null;
  if (typeof name !== 'string' || !name) return null;
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) return null;
  if (typeof lon !== 'number' || isNaN(lon) || lon < -180 || lon > 180) return null;
  const now = new Date().toISOString();
  return {
    id,
    name,
    latitude: lat,
    longitude: lon,
    comment: typeof raw.comment === 'string' ? raw.comment : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
  };
}

function coerceLayer(raw: unknown): SerializedLayer | null {
  if (!isObject(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const colorIdRaw = raw.colorId;
  if (typeof id !== 'string' || !id) return null;
  if (typeof name !== 'string' || !name) return null;
  if (!isColorId(colorIdRaw)) return null;
  const now = new Date().toISOString();
  const splatsRaw = Array.isArray(raw.splats) ? raw.splats : [];
  const splats: SerializedSplat[] = [];
  for (const s of splatsRaw) {
    const v = coerceSplat(s);
    if (v) splats.push(v);
  }
  return {
    id,
    name,
    colorId: colorIdRaw,
    visible: raw.visible !== false, // default visible
    position: typeof raw.position === 'number' && isFinite(raw.position) ? raw.position : 0,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    splats,
  };
}

function coerceSplat(raw: unknown): SerializedSplat | null {
  if (!isObject(raw)) return null;
  const lat = raw.lat;
  const lon = raw.lon;
  const radiusM = raw.radiusM;
  if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) return null;
  if (typeof lon !== 'number' || isNaN(lon) || lon < -180 || lon > 180) return null;
  if (typeof radiusM !== 'number' || !isFinite(radiusM) || radiusM <= 0) return null;
  return { lat, lon, radiusM };
}

function coerceAlert(raw: unknown): Alert | null {
  if (!isObject(raw)) return null;
  const id = raw.id;
  const spotId = raw.spotId;
  const name = raw.name;
  const message = raw.message;
  if (typeof id !== 'string' || !id) return null;
  if (typeof spotId !== 'string' || !spotId) return null;
  if (typeof name !== 'string' || !name) return null;
  if (typeof message !== 'string') return null;
  const now = new Date().toISOString();
  const criteria = isObject(raw.criteria) ? raw.criteria : {};
  return {
    id,
    spotId,
    name,
    message,
    enabled: raw.enabled !== false, // default true if missing/odd
    timeOfDayStart: typeof raw.timeOfDayStart === 'string' ? raw.timeOfDayStart : '00:00',
    timeOfDayEnd: typeof raw.timeOfDayEnd === 'string' ? raw.timeOfDayEnd : '23:59',
    criteria: criteria as Alert['criteria'],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    lastTriggeredAt: typeof raw.lastTriggeredAt === 'string' ? raw.lastTriggeredAt : undefined,
    lastTriggeredWindowHash: typeof raw.lastTriggeredWindowHash === 'string'
      ? raw.lastTriggeredWindowHash
      : undefined,
  };
}
