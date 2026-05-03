import * as SQLite from 'expo-sqlite';

const DB_NAME = 'kystvarsel.db';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync('PRAGMA foreign_keys = ON;');
  return _db;
}

/**
 * Initialize the database. Runs migrations sequentially based on the
 * stored schema version. Add a new migration by appending to MIGRATIONS;
 * never edit a migration that has already shipped.
 */
export async function initDatabase(): Promise<void> {
  const db = await getDb();

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_version LIMIT 1',
  );
  let current = row?.version ?? 0;

  for (let i = current; i < MIGRATIONS.length; i++) {
    await MIGRATIONS[i](db);
    current = i + 1;
    await db.runAsync('DELETE FROM schema_version');
    await db.runAsync('INSERT INTO schema_version (version) VALUES (?)', current);
  }
}

type Migration = (db: SQLite.SQLiteDatabase) => Promise<void>;

const MIGRATIONS: Migration[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS spots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        comment TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        spot_id TEXT NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        message TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        time_of_day_start TEXT NOT NULL DEFAULT '00:00',
        time_of_day_end TEXT NOT NULL DEFAULT '23:59',
        criteria_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_triggered_at TEXT,
        last_triggered_window_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_alerts_spot ON alerts(spot_id);

      CREATE TABLE IF NOT EXISTS forecast_cache (
        spot_key TEXT PRIMARY KEY,
        fetched_at TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
  },

  // Migration 1 — Phase 4 painted map layers.
  async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS map_layers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color_id TEXT NOT NULL,
        visible INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS layer_splats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        layer_id TEXT NOT NULL REFERENCES map_layers(id) ON DELETE CASCADE,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        radius_m REAL NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_layer_splats_layer ON layer_splats(layer_id);
    `);
  },
];
