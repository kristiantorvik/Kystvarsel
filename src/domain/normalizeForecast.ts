import type {
  ForecastBundle,
  HourlyForecast,
  RawOceanEntry,
  RawTideEntry,
  RawWeatherEntry,
  SourceStatus,
} from './forecastTypes';
import { toOsloLocalString } from '../utils/time';

interface NormalizeInput {
  /** Map of ISO-UTC hour string -> weather entry. */
  weather: Record<string, RawWeatherEntry>;
  weatherStatus: SourceStatus;
  ocean: Record<string, RawOceanEntry>;
  oceanStatus: SourceStatus;
  tides: Record<string, RawTideEntry>;
  tideStatus: SourceStatus;
  /** Optional cutoffs in UTC ISO. Hours outside [from, to] are dropped. */
  fromUtc?: string;
  toUtc?: string;
}

/**
 * Normalize the ISO timestamp returned by upstream APIs to a canonical "...Z" form
 * truncated to whole hours. Returns null if it can't be parsed.
 */
export function canonicalUtcHour(iso: string): string | null {
  let s = iso.trim();
  if (!s) return null;
  // Kartverket may omit the trailing Z when dst=0 — add it.
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s = s + 'Z';
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString().replace('.000Z', 'Z');
}

function nullishToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

/**
 * Merge weather, ocean, and tide records into a sorted array of HourlyForecast.
 * Keyed by canonical UTC hour. Tide direction is derived by comparing each hour's
 * tide level with the previous hour's level (falls back to next hour at the start).
 */
export function normalizeForecast(input: NormalizeInput): HourlyForecast[] {
  const allKeysRaw = new Set<string>();
  for (const k of Object.keys(input.weather)) {
    const c = canonicalUtcHour(k);
    if (c) allKeysRaw.add(c);
  }
  for (const k of Object.keys(input.ocean)) {
    const c = canonicalUtcHour(k);
    if (c) allKeysRaw.add(c);
  }
  for (const k of Object.keys(input.tides)) {
    const c = canonicalUtcHour(k);
    if (c) allKeysRaw.add(c);
  }

  // Re-key inputs into canonical form for fast lookup.
  const w = rekey(input.weather);
  const o = rekey(input.ocean);
  const t = rekey(input.tides);

  const fromMs = input.fromUtc ? Date.parse(input.fromUtc) : -Infinity;
  const toMs = input.toUtc ? Date.parse(input.toUtc) : Infinity;

  const sortedKeys = [...allKeysRaw]
    .filter((k) => {
      const ms = Date.parse(k);
      return ms >= fromMs && ms <= toMs;
    })
    .sort();

  const out: HourlyForecast[] = sortedKeys.map((key, i) => {
    const we = w[key];
    const oe = o[key];
    const te = t[key];

    const tideLevel = nullishToUndef(te?.water_level_cm);
    const prevTide = i > 0 ? nullishToUndef(t[sortedKeys[i - 1]]?.water_level_cm) : undefined;
    const nextTide = i < sortedKeys.length - 1
      ? nullishToUndef(t[sortedKeys[i + 1]]?.water_level_cm)
      : undefined;

    const tideDirection = computeTideDirection(prevTide, tideLevel, nextTide);

    return {
      timeUtc: key,
      timeLocal: toOsloLocalString(key),
      airTemperatureC: nullishToUndef(we?.air_temp_c),
      windSpeedMs: nullishToUndef(we?.wind_speed_ms),
      windDirectionDeg: nullishToUndef(we?.wind_from_deg),
      precipitationMm: nullishToUndef(we?.precip_mm_1h),
      weatherSymbol: nullishToUndef(we?.symbol),
      seaWaterTemperatureC: nullishToUndef(oe?.sst_c),
      waveHeightM: nullishToUndef(oe?.wave_height_m),
      waveDirectionDeg: nullishToUndef(oe?.wave_from_deg),
      currentSpeedMs: nullishToUndef(oe?.current_speed_ms),
      currentDirectionDeg: nullishToUndef(oe?.current_to_deg),
      tideLevelCm: tideLevel,
      tideDirection,
      sourceStatus: {
        weather: we ? input.weatherStatus : input.weatherStatus === 'ok' ? 'missing' : input.weatherStatus,
        ocean: oe ? input.oceanStatus : input.oceanStatus === 'ok' ? 'missing' : input.oceanStatus,
        tide: te ? input.tideStatus : input.tideStatus === 'ok' ? 'missing' : input.tideStatus,
      },
    };
  });

  return out;
}

function rekey<T>(m: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(m)) {
    const c = canonicalUtcHour(k);
    if (c) out[c] = v;
  }
  return out;
}

function computeTideDirection(
  prev: number | undefined,
  curr: number | undefined,
  next: number | undefined,
): 'rising' | 'falling' | 'unknown' {
  if (curr == null) return 'unknown';
  if (prev != null) {
    if (curr > prev) return 'rising';
    if (curr < prev) return 'falling';
  }
  if (next != null) {
    if (next > curr) return 'rising';
    if (next < curr) return 'falling';
  }
  return 'unknown';
}

export function buildBundle(
  hours: HourlyForecast[],
  attribution: ForecastBundle['attribution'],
): ForecastBundle {
  return {
    fetchedAtUtc: new Date().toISOString(),
    hours,
    attribution,
  };
}
