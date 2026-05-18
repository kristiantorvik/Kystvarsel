import { getDb } from './db';

export const settingsRepository = {
  async get(key: string): Promise<string | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = ?',
      key,
    );
    return row?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
      key,
      value,
    );
  },
};

export const SETTINGS_KEYS = {
  lastCheckAt: 'lastCheckAt',
  /**
   * Hour-of-day (0..23) for the once-per-day background alert check.
   * Stored as a string of the integer. Minutes are intentionally omitted —
   * Android's background scheduling is too coarse for sub-hour precision
   * to be meaningful, and a single-field UI is friendlier.
   */
  dailyCheckHour: 'dailyCheckHour',
  /**
   * Whether to render a stationary crosshair at the centre of every map
   * view. Stored as '1' / '0'. Useful when pointing at something on a
   * small phone screen — the user can move the map so the target sits
   * under the crosshair instead of covering it with their finger.
   */
  showCrosshair: 'showCrosshair',
  /**
   * Default Leaflet zoom level used when "jumping" to a spot from the
   * forecast view's "Vis på kart" button. Stored as a string integer
   * in the range 8..18 (matches Kartverket WMTS maxZoom of 18).
   */
  jumpZoomLevel: 'jumpZoomLevel',
} as const;

/** Default check time if the user hasn't set one — 07:00 local. */
export const DEFAULT_DAILY_CHECK_HOUR = 7;

function clampHour(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAILY_CHECK_HOUR;
  return Math.max(0, Math.min(23, Math.floor(n)));
}

/**
 * Read the user's preferred daily-check hour (0..23). Falls back to the
 * default if unset or if the stored value parses as NaN. Always returns a
 * valid hour so callers don't need further validation.
 */
export async function getDailyCheckHour(): Promise<number> {
  const raw = await settingsRepository.get(SETTINGS_KEYS.dailyCheckHour);
  if (raw == null) return DEFAULT_DAILY_CHECK_HOUR;
  return clampHour(parseInt(raw, 10));
}

export async function setDailyCheckHour(hour: number): Promise<void> {
  await settingsRepository.set(SETTINGS_KEYS.dailyCheckHour, String(clampHour(hour)));
}

/** Crosshair visible at the centre of every map view. Defaults to off. */
export async function getShowCrosshair(): Promise<boolean> {
  const raw = await settingsRepository.get(SETTINGS_KEYS.showCrosshair);
  return raw === '1';
}

export async function setShowCrosshair(on: boolean): Promise<void> {
  await settingsRepository.set(SETTINGS_KEYS.showCrosshair, on ? '1' : '0');
}

/**
 * Default zoom level when jumping to a spot on the map from the
 * forecast view. 14 fits a coastal area nicely on a phone — close
 * enough to see local geography (islands, harbours) but not so tight
 * the user immediately loses context. Clamped to [8, 18]; Kartverket's
 * WMTS caches have maxZoom 18, anything below 8 makes the spot dot
 * vanish in the continent view.
 */
export const DEFAULT_JUMP_ZOOM = 14;
export const MIN_JUMP_ZOOM = 8;
export const MAX_JUMP_ZOOM = 18;

function clampJumpZoom(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_JUMP_ZOOM;
  return Math.max(MIN_JUMP_ZOOM, Math.min(MAX_JUMP_ZOOM, Math.floor(n)));
}

export async function getJumpZoom(): Promise<number> {
  const raw = await settingsRepository.get(SETTINGS_KEYS.jumpZoomLevel);
  if (raw == null) return DEFAULT_JUMP_ZOOM;
  return clampJumpZoom(parseInt(raw, 10));
}

export async function setJumpZoom(zoom: number): Promise<void> {
  await settingsRepository.set(
    SETTINGS_KEYS.jumpZoomLevel,
    String(clampJumpZoom(zoom)),
  );
}
