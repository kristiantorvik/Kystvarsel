import { haversineDistanceM, subdivideAroundEraser, type CircleSplat } from '../utils/geo';

export interface EraseInputSplat {
  /** SQLite row id; preserved across the diff so callers know what to delete. */
  id: number;
  lat: number;
  lon: number;
  radiusM: number;
}

export interface EraseInputEraser {
  lat: number;
  lon: number;
  radiusM: number;
}

export interface EraseDiff {
  /** IDs of original splats that should be removed from the DB. */
  toDelete: number[];
  /** New splats produced by subdivision that should be inserted. */
  toInsert: CircleSplat[];
  /** Original splat *records* that were removed — surfaced so callers can
   *  remember enough to undo the erase later. */
  removedSplats: EraseInputSplat[];
}

/**
 * Splats whose radius is more than this multiple of the eraser's radius get
 * recursively subdivided. Smaller splats are deleted whole.
 */
const SUBDIVIDE_THRESHOLD = 2.0;

/**
 * Compute the full set of DB ops for an erase stroke (a sequence of eraser
 * positions) given the current splats of one layer.
 *
 * Pure function — no DB, no I/O. Lives in the domain layer so it can be
 * unit-tested without mocking SQLite. {@link layersRepository.eraseBatch}
 * calls this with the splats it just read, then applies the diff inside a
 * single transaction.
 *
 * Multi-eraser semantics: we walk a working set in JS, and after each
 * eraser the working set reflects subdivisions produced by earlier
 * erasers in the same stroke. Without that, a long drag would only carve
 * the first contact disc and leave the rest of its path visually intact.
 */
export function computeEraseDiff(
  splats: EraseInputSplat[],
  erasers: EraseInputEraser[],
): EraseDiff {
  if (erasers.length === 0 || splats.length === 0) {
    return { toDelete: [], toInsert: [], removedSplats: [] };
  }

  // Working entries either reference an existing DB row (`id != null`) or are
  // brand-new splats produced earlier in this batch (`id === null`).
  interface Working {
    id: number | null;
    lat: number;
    lon: number;
    radiusM: number;
  }
  let working: Working[] = splats.map((s) => ({
    id: s.id,
    lat: s.lat,
    lon: s.lon,
    radiusM: s.radiusM,
  }));

  for (const e of erasers) {
    const next: Working[] = [];
    for (const w of working) {
      const d = haversineDistanceM(e.lat, e.lon, w.lat, w.lon);
      if (d > e.radiusM + w.radiusM) {
        next.push(w); // no overlap → keep
        continue;
      }
      // Splat intersects this eraser. Drop it from the working set.
      // If it's substantially bigger than the eraser, replace with a
      // recursive subdivision so the cut has eraser-scale resolution.
      if (w.radiusM > e.radiusM * SUBDIVIDE_THRESHOLD) {
        const replacements = subdivideAroundEraser(
          { lat: w.lat, lon: w.lon, radiusM: w.radiusM },
          e.lat,
          e.lon,
          e.radiusM,
          { targetRadiusM: e.radiusM },
        );
        for (const child of replacements) {
          next.push({ id: null, lat: child.lat, lon: child.lon, radiusM: child.radiusM });
        }
      }
      // else: splat is comparable in size to eraser — just drop, no need to
      // resample.
    }
    working = next;
  }

  // Compare working set against the original splats to derive the diff.
  const survivingIds = new Set<number>();
  const toInsert: CircleSplat[] = [];
  for (const w of working) {
    if (w.id != null) survivingIds.add(w.id);
    else toInsert.push({ lat: w.lat, lon: w.lon, radiusM: w.radiusM });
  }
  const toDelete: number[] = [];
  const removedSplats: EraseInputSplat[] = [];
  for (const s of splats) {
    if (!survivingIds.has(s.id)) {
      toDelete.push(s.id);
      removedSplats.push(s);
    }
  }
  return { toDelete, toInsert, removedSplats };
}
