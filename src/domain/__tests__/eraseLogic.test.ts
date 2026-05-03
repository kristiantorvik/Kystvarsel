import { computeEraseDiff } from '../eraseLogic';

const COS60 = Math.cos((60 * Math.PI) / 180);
const M_PER_LAT_DEG = 111_320;

/** Convert a small east-west offset in meters to a delta in lon-degrees at lat 60°. */
function lonDelta(meters: number): number {
  return meters / (M_PER_LAT_DEG * COS60);
}

describe('computeEraseDiff', () => {
  test('empty inputs → empty diff', () => {
    expect(computeEraseDiff([], [{ lat: 60, lon: 5, radiusM: 2 }])).toEqual({
      toDelete: [],
      toInsert: [],
      removedSplats: [],
    });
    expect(computeEraseDiff(
      [{ id: 1, lat: 60, lon: 5, radiusM: 5 }],
      [],
    )).toEqual({
      toDelete: [],
      toInsert: [],
      removedSplats: [],
    });
  });

  test('eraser fully outside any splat → no-op', () => {
    const diff = computeEraseDiff(
      [{ id: 1, lat: 60, lon: 5, radiusM: 5 }],
      [{ lat: 60.5, lon: 5.5, radiusM: 2 }], // far away
    );
    expect(diff.toDelete).toEqual([]);
    expect(diff.toInsert).toEqual([]);
  });

  test('eraser comparable in size to splat → delete, no subdivision', () => {
    // Splat radius 3, eraser radius 2 — ratio 1.5, under the 2.0 threshold.
    const diff = computeEraseDiff(
      [{ id: 7, lat: 60, lon: 5, radiusM: 3 }],
      [{ lat: 60, lon: 5, radiusM: 2 }],
    );
    expect(diff.toDelete).toEqual([7]);
    expect(diff.toInsert).toEqual([]);
    expect(diff.removedSplats.length).toBe(1);
    expect(diff.removedSplats[0].id).toBe(7);
  });

  test('eraser much smaller than splat → subdivide', () => {
    // Splat radius 30, eraser radius 2, eraser at the edge.
    const diff = computeEraseDiff(
      [{ id: 1, lat: 60, lon: 5, radiusM: 30 }],
      [{ lat: 60, lon: 5 + lonDelta(25), radiusM: 2 }],
    );
    expect(diff.toDelete).toEqual([1]);
    // Recursive subdivision yields many smaller replacements, well above
    // the comparable-size case (which produced zero).
    expect(diff.toInsert.length).toBeGreaterThan(5);
    // All insertions are smaller than the original.
    for (const r of diff.toInsert) {
      expect(r.radiusM).toBeLessThanOrEqual(30 / 2 + 0.1);
    }
  });

  test('eraser entirely inside splat → splat removed and resampled', () => {
    const diff = computeEraseDiff(
      [{ id: 1, lat: 60, lon: 5, radiusM: 30 }],
      [{ lat: 60, lon: 5, radiusM: 2 }], // dead center
    );
    expect(diff.toDelete).toEqual([1]);
    expect(diff.toInsert.length).toBeGreaterThan(0);
    // The "donut hole" — no replacement may have its center inside the
    // eraser (the recursive subdivision drops centers <= eraserR).
    for (const r of diff.toInsert) {
      const dx = (r.lon - 5) * (M_PER_LAT_DEG * COS60);
      const dy = (r.lat - 60) * M_PER_LAT_DEG;
      const d = Math.hypot(dx, dy);
      expect(d).toBeGreaterThan(2);
    }
  });

  test('multi-eraser stroke: subsequent erasers see splats produced earlier', () => {
    // One source splat. Two erasers next to each other. Without the
    // working-set propagation, the second eraser would see the original
    // (deleted) splat and produce nothing; with it, the second eraser
    // operates on the level-1 children produced by the first.
    const diff = computeEraseDiff(
      [{ id: 1, lat: 60, lon: 5, radiusM: 30 }],
      [
        { lat: 60, lon: 5 + lonDelta(20), radiusM: 2 },
        { lat: 60, lon: 5 + lonDelta(22), radiusM: 2 },
      ],
    );
    expect(diff.toDelete).toEqual([1]);
    // No surviving replacement should have its center inside either eraser.
    for (const r of diff.toInsert) {
      for (const eraserLon of [5 + lonDelta(20), 5 + lonDelta(22)]) {
        const dx = (r.lon - eraserLon) * (M_PER_LAT_DEG * COS60);
        const dy = (r.lat - 60) * M_PER_LAT_DEG;
        const d = Math.hypot(dx, dy);
        expect(d).toBeGreaterThan(2);
      }
    }
  });

  test('does not touch unrelated splats', () => {
    // Two splats, eraser only hits one.
    const diff = computeEraseDiff(
      [
        { id: 1, lat: 60, lon: 5, radiusM: 5 },
        { id: 2, lat: 60.1, lon: 5.1, radiusM: 5 }, // far away
      ],
      [{ lat: 60, lon: 5, radiusM: 2 }],
    );
    expect(diff.toDelete).toEqual([1]);
    expect(diff.removedSplats.map((s) => s.id)).toEqual([1]);
    // splat 2 untouched
  });

  test('removedSplats carries enough data to reconstruct', () => {
    const original = { id: 42, lat: 60.123, lon: 5.456, radiusM: 7.5 };
    const diff = computeEraseDiff(
      [original],
      [{ lat: 60.123, lon: 5.456, radiusM: 100 }], // big eraser, fully covers
    );
    expect(diff.toDelete).toEqual([42]);
    expect(diff.removedSplats.length).toBe(1);
    expect(diff.removedSplats[0]).toEqual(original);
  });
});
