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
