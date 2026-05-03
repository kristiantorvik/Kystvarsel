import { parseImport, CURRENT_SCHEMA_VERSION } from '../exportImport';

describe('parseImport', () => {
  test('accepts a minimal well-formed payload', () => {
    const json = JSON.stringify({
      kystvarselVersion: '0.1.0',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAtUtc: '2026-04-30T12:00:00Z',
      spots: [],
      alerts: [],
      layers: [],
    });
    const r = parseImport(json);
    expect(r.ok).toBe(true);
  });

  test('rejects malformed JSON', () => {
    const r = parseImport('{not valid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('malformed');
  });

  test('rejects non-object top level', () => {
    const r = parseImport('[]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrongType');
  });

  test('rejects missing schemaVersion', () => {
    const r = parseImport(JSON.stringify({ spots: [], alerts: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wrongType');
  });

  test('rejects newer schemaVersion', () => {
    const r = parseImport(
      JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, spots: [], alerts: [] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unsupportedVersion');
  });

  test('rejects when spots is not an array', () => {
    const r = parseImport(JSON.stringify({ schemaVersion: 1, spots: 'no', alerts: [] }));
    expect(r.ok).toBe(false);
  });

  test('skips invalid spot entries but accepts the payload', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 1,
        spots: [
          { id: 'a', name: 'OK', latitude: 60, longitude: 5 },
          { id: 'b', name: 'NoLat', longitude: 5 }, // invalid — dropped
          { id: '', name: 'EmptyId', latitude: 60, longitude: 5 }, // invalid — dropped
          { id: 'c', name: 'BadLat', latitude: 99, longitude: 5 }, // out of range — dropped
        ],
        alerts: [],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.spots.length).toBe(1);
      expect(r.payload.spots[0].id).toBe('a');
    }
  });

  test('coerces missing optional fields on a spot', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 1,
        spots: [{ id: 'a', name: 'X', latitude: 60, longitude: 5 }],
        alerts: [],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      const spot = r.payload.spots[0];
      expect(spot.comment).toBeUndefined();
      expect(typeof spot.createdAt).toBe('string');
      expect(typeof spot.updatedAt).toBe('string');
    }
  });

  test('alert without spotId is rejected, alert with empty criteria defaults', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 1,
        spots: [],
        alerts: [
          { id: 'a1', spotId: 's1', name: 'OK', message: 'hi' },
          { id: 'a2', name: 'NoSpot', message: 'hi' }, // dropped
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.alerts.length).toBe(1);
      expect(r.payload.alerts[0].id).toBe('a1');
      expect(r.payload.alerts[0].enabled).toBe(true);
      expect(r.payload.alerts[0].timeOfDayStart).toBe('00:00');
    }
  });

  test('layers default to empty array if missing or wrong type', () => {
    const r1 = parseImport(JSON.stringify({ schemaVersion: 1, spots: [], alerts: [] }));
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.payload.layers).toEqual([]);

    const r2 = parseImport(
      JSON.stringify({ schemaVersion: 1, spots: [], alerts: [], layers: 'no' }),
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.payload.layers).toEqual([]);
  });

  test('schema v1 imports cleanly into v2 reader (forward compat)', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 1,
        spots: [{ id: 's1', name: 'X', latitude: 60, longitude: 5 }],
        alerts: [],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.layers).toEqual([]);
      expect(r.payload.spots.length).toBe(1);
    }
  });

  test('valid layer with splats parses', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 2,
        spots: [],
        alerts: [],
        layers: [
          {
            id: 'l1',
            name: 'Skjell',
            colorId: 'c4',
            visible: true,
            position: 0,
            splats: [
              { lat: 60.18, lon: 5.02, radiusM: 30 },
              { lat: 60.19, lon: 5.03, radiusM: 25 },
            ],
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.layers.length).toBe(1);
      const l = r.payload.layers[0];
      expect(l.id).toBe('l1');
      expect(l.colorId).toBe('c4');
      expect(l.splats.length).toBe(2);
      expect(l.splats[0].radiusM).toBe(30);
    }
  });

  test('layer with unknown colorId is dropped', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 2,
        spots: [],
        alerts: [],
        layers: [
          { id: 'l1', name: 'X', colorId: 'magenta', visible: true, position: 0, splats: [] },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.layers.length).toBe(0);
  });

  test('bad splats inside a valid layer are filtered, layer kept', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 2,
        spots: [],
        alerts: [],
        layers: [
          {
            id: 'l1',
            name: 'X',
            colorId: 'c1',
            visible: true,
            position: 0,
            splats: [
              { lat: 60, lon: 5, radiusM: 10 },     // good
              { lat: 60, lon: 5 },                   // missing radius — dropped
              { lat: 99, lon: 5, radiusM: 10 },     // out-of-range lat — dropped
              { lat: 60, lon: 5, radiusM: -1 },     // negative radius — dropped
              { lat: 60, lon: 5, radiusM: 0 },      // zero radius — dropped
            ],
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.layers.length).toBe(1);
      expect(r.payload.layers[0].splats.length).toBe(1);
    }
  });

  test('layer visibility round-trips, defaulting to true if missing', () => {
    const r = parseImport(
      JSON.stringify({
        schemaVersion: 2,
        spots: [],
        alerts: [],
        layers: [
          { id: 'l1', name: 'A', colorId: 'c1', visible: false, position: 0, splats: [] },
          { id: 'l2', name: 'B', colorId: 'c2', position: 1, splats: [] }, // no `visible`
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.layers[0].visible).toBe(false);
      expect(r.payload.layers[1].visible).toBe(true);
    }
  });
});
