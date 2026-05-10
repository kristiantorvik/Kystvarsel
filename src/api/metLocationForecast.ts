import type { RawWeatherEntry } from '../domain/forecastTypes';
import { getUserAgent } from './userAgent';

const ENDPOINT = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

export interface LocationForecastResult {
  data: Record<string, RawWeatherEntry>;
  /**
   * Server-provided Last-Modified value to send back as
   * `If-Modified-Since` on the next request. `null` means the server
   * didn't supply one (rare for MET).
   */
  lastModified: string | null;
  /**
   * True when the server returned 304 Not Modified — body is empty and
   * `data` is `{}`. The caller should reuse its existing cache.
   */
  notModified: boolean;
}

interface FetchOptions {
  /** Last-Modified value from the previous response. Sent as If-Modified-Since. */
  ifModifiedSince?: string | null;
  signal?: AbortSignal;
}

/**
 * Fetch atmospheric weather from MET Norway Locationforecast.
 *
 * Conditional caching: when `ifModifiedSince` is supplied we send it as
 * the `If-Modified-Since` header. MET responds with 304 Not Modified
 * (no body) when its forecast hasn't been updated since that timestamp.
 * MET's terms expect this — it's both bandwidth-friendly and the
 * documented way to be a polite client.
 */
export async function fetchLocationForecast(
  lat: number,
  lon: number,
  options: FetchOptions = {},
): Promise<LocationForecastResult> {
  const url = `${ENDPOINT}?lat=${lat}&lon=${lon}`;
  const headers: Record<string, string> = {
    'User-Agent': getUserAgent(),
    Accept: 'application/json',
  };
  if (options.ifModifiedSince) {
    headers['If-Modified-Since'] = options.ifModifiedSince;
  }

  const res = await fetch(url, { headers, signal: options.signal });

  if (res.status === 304) {
    // Body is empty by spec. Echo the IMS we sent so the caller can
    // treat it as the canonical Last-Modified for the still-valid cache.
    return { data: {}, lastModified: options.ifModifiedSince ?? null, notModified: true };
  }
  if (!res.ok) {
    throw new Error(`MET Locationforecast HTTP ${res.status}`);
  }

  const lastModified = res.headers.get('last-modified');
  const json: any = await res.json();
  const out: Record<string, RawWeatherEntry> = {};
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series)) {
    return { data: out, lastModified, notModified: false };
  }

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
  return { data: out, lastModified, notModified: false };
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && !isNaN(v) ? v : null;
}
