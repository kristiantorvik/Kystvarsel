import { getDb } from './db';
import type { Alert, AlertCriteria } from '../domain/alertTypes';
import { newId } from '../utils/uuid';

interface AlertRow {
  id: string;
  spot_id: string;
  name: string;
  message: string;
  enabled: number;
  time_of_day_start: string;
  time_of_day_end: string;
  criteria_json: string;
  created_at: string;
  updated_at: string;
  last_triggered_at: string | null;
  last_triggered_window_hash: string | null;
}

function toAlert(r: AlertRow): Alert {
  let criteria: AlertCriteria = {};
  try {
    criteria = JSON.parse(r.criteria_json) as AlertCriteria;
  } catch {
    // fall back to empty criteria so a corrupted row doesn't crash the list
  }
  return {
    id: r.id,
    spotId: r.spot_id,
    name: r.name,
    message: r.message,
    enabled: r.enabled !== 0,
    timeOfDayStart: r.time_of_day_start,
    timeOfDayEnd: r.time_of_day_end,
    criteria,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastTriggeredAt: r.last_triggered_at ?? undefined,
    lastTriggeredWindowHash: r.last_triggered_window_hash ?? undefined,
  };
}

export const alertsRepository = {
  async list(): Promise<Alert[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AlertRow>(
      'SELECT * FROM alerts ORDER BY name COLLATE NOCASE',
    );
    return rows.map(toAlert);
  },

  async listEnabled(): Promise<Alert[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<AlertRow>(
      'SELECT * FROM alerts WHERE enabled = 1',
    );
    return rows.map(toAlert);
  },

  async get(id: string): Promise<Alert | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<AlertRow>('SELECT * FROM alerts WHERE id = ?', id);
    return row ? toAlert(row) : null;
  },

  async create(
    input: Omit<Alert, 'id' | 'createdAt' | 'updatedAt' | 'lastTriggeredAt' | 'lastTriggeredWindowHash'>,
  ): Promise<Alert> {
    const db = await getDb();
    const now = new Date().toISOString();
    const a: Alert = { id: newId(), createdAt: now, updatedAt: now, ...input };
    await db.runAsync(
      `INSERT INTO alerts (id, spot_id, name, message, enabled,
                           time_of_day_start, time_of_day_end, criteria_json,
                           created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      a.id,
      a.spotId,
      a.name,
      a.message,
      a.enabled ? 1 : 0,
      a.timeOfDayStart,
      a.timeOfDayEnd,
      JSON.stringify(a.criteria ?? {}),
      a.createdAt,
      a.updatedAt,
    );
    return a;
  },

  async update(a: Alert): Promise<Alert> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE alerts SET spot_id = ?, name = ?, message = ?, enabled = ?,
                          time_of_day_start = ?, time_of_day_end = ?, criteria_json = ?,
                          updated_at = ?
       WHERE id = ?`,
      a.spotId,
      a.name,
      a.message,
      a.enabled ? 1 : 0,
      a.timeOfDayStart,
      a.timeOfDayEnd,
      JSON.stringify(a.criteria ?? {}),
      updatedAt,
      a.id,
    );
    return { ...a, updatedAt };
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      'UPDATE alerts SET enabled = ?, updated_at = ? WHERE id = ?',
      enabled ? 1 : 0,
      updatedAt,
      id,
    );
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM alerts WHERE id = ?', id);
  },

  async recordTrigger(id: string, windowHash: string, at: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      'UPDATE alerts SET last_triggered_at = ?, last_triggered_window_hash = ? WHERE id = ?',
      at,
      windowHash,
      id,
    );
  },
};
