import { getDb } from './db';
import type { Spot } from '../domain/alertTypes';
import { newId } from '../utils/uuid';

interface SpotRow {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

function toSpot(r: SpotRow): Spot {
  return {
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    comment: r.comment ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const spotsRepository = {
  async list(): Promise<Spot[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<SpotRow>(
      'SELECT * FROM spots ORDER BY name COLLATE NOCASE',
    );
    return rows.map(toSpot);
  },

  async get(id: string): Promise<Spot | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<SpotRow>('SELECT * FROM spots WHERE id = ?', id);
    return row ? toSpot(row) : null;
  },

  async create(input: Omit<Spot, 'id' | 'createdAt' | 'updatedAt'>): Promise<Spot> {
    const db = await getDb();
    const now = new Date().toISOString();
    const spot: Spot = { id: newId(), createdAt: now, updatedAt: now, ...input };
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
    return spot;
  },

  async update(spot: Spot): Promise<Spot> {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    await db.runAsync(
      `UPDATE spots SET name = ?, latitude = ?, longitude = ?, comment = ?, updated_at = ?
       WHERE id = ?`,
      spot.name,
      spot.latitude,
      spot.longitude,
      spot.comment ?? null,
      updatedAt,
      spot.id,
    );
    return { ...spot, updatedAt };
  },

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.runAsync('DELETE FROM spots WHERE id = ?', id);
  },
};
