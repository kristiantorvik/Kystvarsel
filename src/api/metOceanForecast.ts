import type { RawOceanEntry } from '../domain/forecastTypes';
import { getUserAgent } from './userAgent';

const ENDPOINT = 'https://api.met.no/weatherapi/oceanforecast/2.0/complete';

/**
 * Fetch sea state, current, and SST from MET Norway Oceanforecast.
 * Mirrors `fetch_ocean` from the Python reference.
 */
export async function fetchOceanForecast(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Record<string, RawOceanEntry>> {
  const url = `${ENDPOINT}?lat=${lat}&lon=${lon}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': getUserAgent(), Accept: 'application/json' },
    signal,
  });
  if (!res.ok) {
    throw new Error(`MET Oceanforecast HTTP ${res.status}`);
  }
  const json: any = await res.json();
  const out: Record<string, RawOceanEntry> = {};
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series)) return out;

  for (const ts of series) {
    const time = ts?.time;
    const details = ts?.data?.instant?.details ?? {};
    if (typeof time !== 'string') continue;
    out[time] = {
      sst_c: numOrNull(details.sea_water_temperature),
      wave_height_m: numOrNull(details.sea_surface_wave_height),
      wave_from_deg: numOrNull(details.sea_surface_wave_from_direction),
      current_speed_ms: numOrNull(details.sea_water_speed),
      current_to_deg: numOrNull(details.sea_water_to_direction),
    };
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null;
}
