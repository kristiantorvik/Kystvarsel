import { evaluateAlert, isWithinTimeWindow, computeWindowHash } from '../evaluateAlert';
import type { Alert } from '../alertTypes';
import type { HourlyForecast } from '../forecastTypes';

function hour(overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    timeUtc: '2026-04-27T10:00:00Z',
    timeLocal: '2026-04-27T12:00',
    sourceStatus: { weather: 'ok', ocean: 'ok', tide: 'ok' },
    ...overrides,
  };
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    spotId: 's1',
    name: 'Crab time',
    message: 'Time for catching crabs!!!!',
    enabled: true,
    timeOfDayStart: '00:00',
    timeOfDayEnd: '23:59',
    criteria: {},
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('isWithinTimeWindow', () => {
  test('hour inside same-day window', () => {
    expect(isWithinTimeWindow('2026-04-27T10:00', '06:00', '18:00')).toBe(true);
  });
  test('hour outside same-day window', () => {
    expect(isWithinTimeWindow('2026-04-27T20:00', '06:00', '18:00')).toBe(false);
  });
  test('start inclusive, end exclusive', () => {
    expect(isWithinTimeWindow('2026-04-27T06:00', '06:00', '18:00')).toBe(true);
    expect(isWithinTimeWindow('2026-04-27T18:00', '06:00', '18:00')).toBe(false);
  });
  test('overnight window — late evening matches', () => {
    expect(isWithinTimeWindow('2026-04-27T23:30', '22:00', '04:00')).toBe(true);
  });
  test('overnight window — early morning matches', () => {
    expect(isWithinTimeWindow('2026-04-27T03:00', '22:00', '04:00')).toBe(true);
  });
  test('overnight window — midday does not match', () => {
    expect(isWithinTimeWindow('2026-04-27T12:00', '22:00', '04:00')).toBe(false);
  });
});

describe('evaluateAlert — thresholds', () => {
  test('min/max wind both pass', () => {
    const a = alert({ criteria: { minWindSpeedMs: 0, maxWindSpeedMs: 6 } });
    const r = evaluateAlert(a, [hour({ windSpeedMs: 4 })]);
    expect(r.matchingHours.length).toBe(1);
  });

  test('above max wind fails', () => {
    const a = alert({ criteria: { maxWindSpeedMs: 6 } });
    const r = evaluateAlert(a, [hour({ windSpeedMs: 9 })]);
    expect(r.matchingHours.length).toBe(0);
    expect(r.evaluations[0].failedReasons).toContain('wind:aboveMax');
  });

  test('below min current fails', () => {
    const a = alert({ criteria: { minCurrentSpeedMs: 0.5 } });
    const r = evaluateAlert(a, [hour({ currentSpeedMs: 0.2 })]);
    expect(r.evaluations[0].failedReasons).toContain('current:belowMin');
  });

  test('missing required value fails', () => {
    const a = alert({ criteria: { minSeaTemperatureC: 8 } });
    const r = evaluateAlert(a, [hour({})]); // no seaTemp
    expect(r.matchingHours.length).toBe(0);
    expect(r.evaluations[0].failedReasons).toContain('seaTemp:missing');
  });

  test('no min/max means any value passes (incl. missing)', () => {
    const a = alert({ criteria: {} });
    const r = evaluateAlert(a, [hour({})]);
    expect(r.matchingHours.length).toBe(1);
  });
});

describe('evaluateAlert — rain', () => {
  test('no_rain passes when precipitation is 0', () => {
    const a = alert({ criteria: { rainMode: 'no_rain' } });
    const r = evaluateAlert(a, [hour({ precipitationMm: 0 })]);
    expect(r.matchingHours.length).toBe(1);
  });

  test('no_rain fails when precipitation > 0', () => {
    const a = alert({ criteria: { rainMode: 'no_rain' } });
    const r = evaluateAlert(a, [hour({ precipitationMm: 0.5 })]);
    expect(r.evaluations[0].failedReasons).toContain('precipitation:rain');
  });

  test('no_rain fails when precipitation missing (data gap, conservative)', () => {
    const a = alert({ criteria: { rainMode: 'no_rain' } });
    const r = evaluateAlert(a, [hour({})]);
    expect(r.evaluations[0].failedReasons).toContain('precipitation:missing');
  });

  test('max_precipitation honors threshold', () => {
    const a = alert({ criteria: { rainMode: 'max_precipitation', maxPrecipitationMm: 1.0 } });
    expect(evaluateAlert(a, [hour({ precipitationMm: 0.7 })]).matchingHours.length).toBe(1);
    expect(evaluateAlert(a, [hour({ precipitationMm: 1.5 })]).matchingHours.length).toBe(0);
  });
});

describe('evaluateAlert — tide', () => {
  test('rising required, hour is rising', () => {
    const a = alert({ criteria: { tideDirection: 'rising' } });
    const r = evaluateAlert(a, [hour({ tideDirection: 'rising' })]);
    expect(r.matchingHours.length).toBe(1);
  });

  test('rising required, hour is falling', () => {
    const a = alert({ criteria: { tideDirection: 'rising' } });
    const r = evaluateAlert(a, [hour({ tideDirection: 'falling' })]);
    expect(r.evaluations[0].failedReasons).toContain('tideDirection:wrong');
  });

  test('any tide direction always passes', () => {
    const a = alert({ criteria: { tideDirection: 'any' } });
    expect(evaluateAlert(a, [hour({ tideDirection: 'falling' })]).matchingHours.length).toBe(1);
    expect(evaluateAlert(a, [hour({ tideDirection: 'unknown' })]).matchingHours.length).toBe(1);
  });

  test('tide level min', () => {
    const a = alert({ criteria: { minTideLevelCm: 80 } });
    expect(evaluateAlert(a, [hour({ tideLevelCm: 95 })]).matchingHours.length).toBe(1);
    expect(evaluateAlert(a, [hour({ tideLevelCm: 60 })]).matchingHours.length).toBe(0);
  });
});

describe('evaluateAlert — example crab alert', () => {
  test('full Sommarøy criteria match', () => {
    const a = alert({
      name: 'Sommarøy crabs',
      message: 'Time for catching crabs!!!!',
      timeOfDayStart: '06:00',
      timeOfDayEnd: '18:00',
      criteria: {
        rainMode: 'no_rain',
        minWindSpeedMs: 0,
        maxWindSpeedMs: 6,
        minCurrentSpeedMs: 0.5,
        maxCurrentSpeedMs: 1.5,
        minSeaTemperatureC: 8,
        minTideLevelCm: 80,
        tideDirection: 'rising',
      },
    });
    const matching = hour({
      timeLocal: '2026-04-27T10:00',
      precipitationMm: 0,
      windSpeedMs: 3,
      currentSpeedMs: 0.9,
      seaWaterTemperatureC: 9,
      tideLevelCm: 105,
      tideDirection: 'rising',
    });
    const r = evaluateAlert(a, [matching]);
    expect(r.matchingHours.length).toBe(1);
  });
});

describe('computeWindowHash — deduplication', () => {
  test('same matching slice produces same hash', () => {
    const hours: HourlyForecast[] = [
      hour({ timeUtc: '2026-04-27T08:00:00Z', timeLocal: '2026-04-27T10:00' }),
      hour({ timeUtc: '2026-04-27T09:00:00Z', timeLocal: '2026-04-27T11:00' }),
    ];
    const h1 = computeWindowHash('a1', hours);
    const h2 = computeWindowHash('a1', hours);
    expect(h1).toBe(h2);
  });

  test('different alert id produces different hash', () => {
    const hours: HourlyForecast[] = [hour()];
    expect(computeWindowHash('a1', hours)).not.toBe(computeWindowHash('a2', hours));
  });

  test('different time slice produces different hash', () => {
    const a = [hour({ timeUtc: '2026-04-27T08:00:00Z' })];
    const b = [hour({ timeUtc: '2026-04-27T09:00:00Z' })];
    expect(computeWindowHash('a1', a)).not.toBe(computeWindowHash('a1', b));
  });
});

describe('evaluateAlert — disabled alerts', () => {
  test('engine still evaluates; caller is expected to skip disabled alerts', () => {
    const a = alert({ enabled: false, criteria: { minWindSpeedMs: 0 } });
    const r = evaluateAlert(a, [hour({ windSpeedMs: 5 })]);
    expect(r.matchingHours.length).toBe(1);
  });
});
