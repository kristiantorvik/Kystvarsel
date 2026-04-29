import type { RawWeatherEntry } from '../domain/forecastTypes';
import { getUserAgent } from './userAgent';

const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/**
 * Fetch atmospheric weather from MET Norway Locationforecast.
 * Mirrors the `fetch_weather` function from the Python reference.
 */
export async function fetchLocationForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Record<string, RawWeatherEntry>> {
  const url = `${ENDPOINT}?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': getUserAgent(), Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`MET Locationforecast HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const out: Record<string, RawWeatherEntry> = {};
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series)) return out;

  for (const ts of series) {
    const time = ts?.time;
    const details = ts?.data?.instant?.details ?? {};
    const next1 = ts?.data?.next_1_hours;
    if (typeof time !== 'string') continue;
    out[time] = {
      air_temp_c: numOrNull(details.air_temperature),
      wind_speed_ms: numOrNull(details.wind_speed),
      wind_from_deg: numOrNull(details.wind_from_direction),
      humidity_pct: numOrNull(details.relative_humidity),
      pressure_hpa: numOrNull(details.air_pressure_at_sea_level),
      cloud_pct: numOrNull(details.cloud_area_fraction),
      precip_mm_1h: numOrNull(next1?.details?.precipitation_amount),
      symbol: typeof next1?.summary?.symbol_code === 'string' ? next1.summary.symbol_code : null,
    };
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null;
}
