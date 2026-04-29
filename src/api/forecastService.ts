import { fetchLocationForecast } from './metLocationForecast';
import { fetchOceanForecast } from './metOceanForecast';
import { fetchTides } from './tideApi';
import { normalizeForecast, buildBundle } from '../domain/normalizeForecast';
import type { ForecastBundle } from '../domain/forecastTypes';
import { forecastCacheRepository } from '../data/forecastCacheRepository';

const HOURS_HORIZON = 72;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const ATTRIBUTION = {
  weather: 'MET Norway — Locationforecast 2.0 (CC BY 4.0)',
  ocean: 'MET Norway — Oceanforecast 2.0 (CC BY 4.0)',
  tide: 'Kartverket — Se havnivå (NLOD 2.0)',
};

interface FetchOptions {
  /** Bypass cache and force a network fetch. */
  force?: boolean;
}

function spotKey(lat: number, lon: number): string {
  // Coarse-grain to ~10m so identical-ish coords reuse the same fetch.
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Fetch + normalize forecast for a coordinate. Returns a cached bundle if it
 * is fresher than CACHE_TTL_MS, unless `options.force` is set.
 *
 * If the tide source fails the bundle is still returned with weather + ocean.
 * If a critical source fails, the error is rethrown.
 */
export async function getForecastForSpot(
  lat: number,
  lon: number,
  options: FetchOptions = {},
): Promise<ForecastBundle> {
  const key = spotKey(lat, lon);

  if (!options.force) {
    const cached = await forecastCacheRepository.get(key);
    if (cached && Date.now() - Date.parse(cached.fetchedAtUtc) < CACHE_TTL_MS) {
      return cached;
    }
  }

  const days = Math.ceil(HOURS_HORIZON / 24);

  // Run providers in parallel; resolve each into a status + payload independently
  // so a single provider failure doesn't kill the whole forecast.
  const [weatherR, oceanR, tideR] = await Promise.allSettled([
    fetchLocationForecast(lat, lon),
    fetchOceanForecast(lat, lon),
    fetchTides(lat, lon, days),
  ]);

  // Weather is the only "critical" source — without it there's no time axis.
  if (weatherR.status === 'rejected') {
    throw weatherR.reason instanceof Error
      ? weatherR.reason
      : new Error(String(weatherR.reason));
  }

  const weather = weatherR.value;
  const weatherStatus = 'ok' as const;

  const ocean = oceanR.status === 'fulfilled' ? oceanR.value : {};
  const oceanStatus = oceanR.status === 'fulfilled' ? 'ok' : 'error';

  const tides = tideR.status === 'fulfilled' ? tideR.value.series : {};
  const tideStatus = tideR.status === 'fulfilled' ? 'ok' : 'error';

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  const horizon = new Date(now.getTime() + HOURS_HORIZON * 3600_000);

  const hours = normalizeForecast({
    weather,
    weatherStatus,
    ocean,
    oceanStatus,
    tides,
    tideStatus,
    fromUtc: now.toISOString(),
    toUtc: horizon.toISOString(),
  });

  const bundle = buildBundle(hours, ATTRIBUTION);
  await forecastCacheRepository.put(key, bundle);
  return bundle;
}

/**
 * Fetch forecasts for multiple spots, deduping by coordinate key so two
 * spots at the same coords only hit the network once per check.
 */
export async function getForecastsForSpots(
  spots: Array<{ id: string; latitude: number; longitude: number }>,
  options: FetchOptions = {},
): Promise<Map<string, ForecastBundle>> {
  const byKey = new Map<string, Promise<ForecastBundle>>();
  const result = new Map<string, ForecastBundle>();

  for (const s of spots) {
    const key = spotKey(s.latitude, s.longitude);
    if (!byKey.has(key)) {
      byKey.set(key, getForecastForSpot(s.latitude, s.longitude, options));
    }
  }

  for (const s of spots) {
    const key = spotKey(s.latitude, s.longitude);
    try {
      const b = await byKey.get(key)!;
      result.set(s.id, b);
    } catch {
      // Skip — caller decides what to do about missing spots.
    }
  }
  return result;
}

export const forecastAttribution = ATTRIBUTION;
