import { normalizeForecast, canonicalUtcHour } from '../normalizeForecast';

describe('canonicalUtcHour', () => {
  test('truncates minutes/seconds and forces Z suffix', () => {
    expect(canonicalUtcHour('2026-04-27T10:23:45Z')).toBe('2026-04-27T10:00:00Z');
  });
  test('adds Z to naive UTC timestamps from Kartverket', () => {
    expect(canonicalUtcHour('2026-04-27T10:00')).toBe('2026-04-27T10:00:00Z');
  });
  test('returns null for garbage', () => {
    expect(canonicalUtcHour('hello')).toBeNull();
  });
});

describe('normalizeForecast', () => {
  test('merges three sources by hour', () => {
    const hours = normalizeForecast({
      weather: {
        '2026-04-27T10:00:00Z': { air_temp_c: 7, wind_speed_ms: 3, precip_mm_1h: 0 },
        '2026-04-27T11:00:00Z': { air_temp_c: 8, wind_speed_ms: 4, precip_mm_1h: 0 },
      },
      weatherStatus: 'ok',
      ocean: {
        '2026-04-27T10:00:00Z': { sst_c: 9, current_speed_ms: 0.6 },
        '2026-04-27T11:00:00Z': { sst_c: 9.1, current_speed_ms: 0.7 },
      },
      oceanStatus: 'ok',
      tides: {
        '2026-04-27T10:00:00Z': { water_level_cm: 60 },
        '2026-04-27T11:00:00Z': { water_level_cm: 75 },
      },
      tideStatus: 'ok',
    });

    expect(hours.length).toBe(2);
    expect(hours[0].airTemperatureC).toBe(7);
    expect(hours[0].seaWaterTemperatureC).toBe(9);
    expect(hours[0].tideLevelCm).toBe(60);
    expect(hours[1].tideLevelCm).toBe(75);
    expect(hours[1].tideDirection).toBe('rising');
  });

  test('falling tide is detected', () => {
    const hours = normalizeForecast({
      weather: {},
      weatherStatus: 'ok',
      ocean: {},
      oceanStatus: 'ok',
      tides: {
        '2026-04-27T10:00:00Z': { water_level_cm: 100 },
        '2026-04-27T11:00:00Z': { water_level_cm: 80 },
      },
      tideStatus: 'ok',
    });
    expect(hours[1].tideDirection).toBe('falling');
  });

  test('handles missing fields gracefully', () => {
    const hours = normalizeForecast({
      weather: { '2026-04-27T10:00:00Z': { air_temp_c: 7 } },
      weatherStatus: 'ok',
      ocean: {},
      oceanStatus: 'error',
      tides: {},
      tideStatus: 'missing',
    });
    expect(hours.length).toBe(1);
    expect(hours[0].seaWaterTemperatureC).toBeUndefined();
    expect(hours[0].tideLevelCm).toBeUndefined();
    expect(hours[0].sourceStatus.ocean).toBe('error');
  });

  test('respects fromUtc/toUtc cutoffs', () => {
    const hours = normalizeForecast({
      weather: {
        '2026-04-27T08:00:00Z': { air_temp_c: 5 },
        '2026-04-27T10:00:00Z': { air_temp_c: 7 },
        '2026-04-27T14:00:00Z': { air_temp_c: 9 },
      },
      weatherStatus: 'ok',
      ocean: {},
      oceanStatus: 'ok',
      tides: {},
      tideStatus: 'ok',
      fromUtc: '2026-04-27T09:00:00Z',
      toUtc: '2026-04-27T12:00:00Z',
    });
    expect(hours.length).toBe(1);
    expect(hours[0].airTemperatureC).toBe(7);
  });
});
