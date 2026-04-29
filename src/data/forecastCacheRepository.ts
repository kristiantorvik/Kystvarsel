import { getDb } from './db';
import type { ForecastBundle } from '../domain/forecastTypes';

interface CacheRow {
  spot_key: string;
  fetched_at: string;
  payload_json: string;
}

export const forecastCacheRepository = {
  async get(spotKey: string): Promise<ForecastBundle | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<CacheRow>(
      'SELECT * FROM forecast_cache WHERE spot_key = ?',
      spotKey,
    );
    if (!row) return null;
    try {
      return JSON.parse(row.payload_json) as ForecastBundle;
    } catch {
      return null;
    }
  },

  async put(spotKey: string, bundle: ForecastBundle): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR REPLACE INTO forecast_cache (spot_key, fetched_at, payload_json)
       VALUES (?, ?, ?)`,
      spotKey,
      bundle.fetchedAtUtc,
      JSON.stringify(bundle),
    );
  },

  async clear(): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM forecast_cache');
  },
};
