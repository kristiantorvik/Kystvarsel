import { haversineDistanceM, subdivideAroundEraser } from '../geo';

describe('haversineDistanceM', () => {
  test('zero distance', () => {
    expect(haversineDistanceM(60, 5, 60, 5)).toBe(0);
  });

  test('one degree of latitude ≈ 111 km', () => {
    const d = haversineDistanceM(60, 5, 61, 5);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  test('symmetric in arguments', () => {
    const a = haversineDistanceM(60.18, 5.02, 60.19, 5.03);
    const b = haversineDistanceM(60.19, 5.03, 60.18, 5.02);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

describe('subdivideAroundEraser', () => {
  // Reference splat: 30 m radius near Bergen.
  const source = { lat: 60.18, lon: 5.02, radiusM: 30 };

  test('eraser fully outside: returns the source unchanged', () => {
    // Far away — no overlap.
    const out = subdivideAroundEraser(source, 60.5, 5.5, 5);
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(source);
  });

  test('eraser fully covers source: returns nothing', () => {
    // Eraser much bigger than source, centered on it.
    const out = subdivideAroundEraser(source, source.lat, source.lon, 200);
    expect(out.length).toBe(0);
  });

  test('partial overlap: produces multiple replacements', () => {
    // Eraser at the edge of the source, radius 2 m.
    // Move ~25 m east.
    const eraserLon = source.lon + 25 / (111_320 * Math.cos((source.lat * Math.PI) / 180));
    const out = subdivideAroundEraser(source, source.lat, eraserLon, 2);
    expect(out.length).toBeGreaterThan(5);
    // None of the kept replacements should have their center inside the eraser.
    for (const r of out) {
      const d = haversineDistanceM(r.lat, r.lon, source.lat, eraserLon);
      expect(d).toBeGreaterThan(2);
    }
  });

  test('replacements stay fully within the source disc — no spill', () => {
    const eraserLon = source.lon + 25 / (111_320 * Math.cos((source.lat * Math.PI) / 180));
    const out = subdivideAroundEraser(source, source.lat, eraserLon, 2);
    // Both center inside source AND disc inside source. ≤0.1 m tolerance
    // for floating-point in the equirectangular lat/lon conversions.
    for (const r of out) {
      const d = haversineDistanceM(r.lat, r.lon, source.lat, source.lon);
      expect(d + r.radiusM).toBeLessThanOrEqual(source.radiusM + 0.1);
    }
  });

  test('children near source boundary get shrunk to fit', () => {
    // Push the eraser right against the source edge so most subdivision
    // happens near the boundary.
    const eraserLon = source.lon + 28 / (111_320 * Math.cos((source.lat * Math.PI) / 180));
    const out = subdivideAroundEraser(source, source.lat, eraserLon, 1);
    // Some leaves should have radius below the requested target — those
    // are the ones that hit the source boundary clamp. Without clamping
    // every leaf would be ≥ target.
    const shrunk = out.filter((r) => r.radiusM < 1);
    expect(shrunk.length).toBeGreaterThan(0);
  });

  test('respects targetRadiusM — no leaf smaller than the target band', () => {
    const eraserLon = source.lon + 25 / (111_320 * Math.cos((source.lat * Math.PI) / 180));
    const target = 2;
    const out = subdivideAroundEraser(source, source.lat, eraserLon, target, {
      targetRadiusM: target,
    });
    for (const r of out) {
      // Recursion stops at radius ≈ target (within the 1.5× tolerance the
      // implementation uses to avoid a final layer of barely-bigger splats).
      expect(r.radiusM).toBeGreaterThanOrEqual(target * 0.95);
    }
  });

  test('respects maxResults cap', () => {
    const eraserLon = source.lon + 25 / (111_320 * Math.cos((source.lat * Math.PI) / 180));
    const out = subdivideAroundEraser(source, source.lat, eraserLon, 0.1, {
      targetRadiusM: 0.1,
      maxResults: 50,
    });
    expect(out.length).toBeLessThanOrEqual(50);
  });

  test('zero-radius source or zero-radius eraser produces no output', () => {
    expect(subdivideAroundEraser({ lat: 60, lon: 5, radiusM: 0 }, 60, 5, 10)).toEqual([]);
    expect(subdivideAroundEraser(source, 60, 5, 0)).toEqual([]);
  });
});
