import { fetchLocationForecast } from './metLocationForecast';
import { fetchOceanForecast } from './metOceanForecast';
import { fetchTides } from './tideApi';
import { normalizeForecast, buildBundle } from '../domain/normalizeForecast';
import type { ForecastBundle } from '../domain/forecastTypes';
import { forecastCacheRepository } from '../data/forecastCacheRepository';
import { settingsRepository } from '../data/settingsRepository';

const HOURS_HORIZON = 72;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
/**
 * Tighter staleness window used when a screen wants "fresh enough on
 * entry" without forcing a fetch every single navigation. The forecast
 * screen passes this so a user re-entering a spot sees data ≤ 15 min old.
 */
export const FRESH_ON_ENTRY_MS = 15 * 60 * 1000;

const ATTRIBUTION = {
  weather: 'MET Norway — Locationforecast 2.0 (CC BY 4.0)',
  ocean: 'MET Norway — Oceanforecast 2.0 (CC BY 4.0)',
  tide: 'Kartverket — Se havnivå (NLOD 2.0)',
};

interface FetchOptions {
  /** Bypass cache and force a network fetch. */
  force?: boolean;
  /**
   * Maximum cache age before we go to the network. Defaults to
   * `CACHE_TTL_MS` (1h). Pass a smaller value when the caller wants
   * fresher-than-default data without unconditionally forcing.
   */
  maxAge?: number;
}

/**
 * Thrown when a forecast fetch couldn't complete cleanly — typically when
 * one or more provider requests failed (e.g. offline, intermittent
 * network) but a previously-cached bundle exists. Carries the cached
 * bundle so the UI can fall back to displaying it instead of leaving the
 * user with a blank screen or losing data columns.
 *
 * The repo's old behaviour was to silently rebuild a partial bundle and
 * write it back to the cache, which poisoned the cache for the next
 * launch. Now we keep the cache pristine and surface the failure so the
 * caller can decide what to show — full cached data plus a "couldn't
 * refresh" toast in most cases.
 */
export class PartialFetchError extends Error {
  /** True if at least the weather (critical) provider failed. */
  readonly weatherFailed: boolean;
  /** True if the ocean provider failed. */
  readonly oceanFailed: boolean;
  /** True if the tide provider failed. */
  readonly tideFailed: boolean;
  /** Existing cached bundle, if any — UI should prefer this over showing nothing. */
  readonly fallbackBundle: ForecastBundle | null;

  constructor(input: {
    weatherFailed: boolean;
    oceanFailed: boolean;
    tideFailed: boolean;
    fallbackBundle: ForecastBundle | null;
  }) {
    const failed = [
      input.weatherFailed && 'weather',
      input.oceanFailed && 'ocean',
      input.tideFailed && 'tide',
    ]
      .filter(Boolean)
      .join(', ');
    super(`Partial forecast fetch — failed: ${failed}`);
    this.name = 'PartialFetchError';
    this.weatherFailed = input.weatherFailed;
    this.oceanFailed = input.oceanFailed;
    this.tideFailed = input.tideFailed;
    this.fallbackBundle = input.fallbackBundle;
  }
}

function spotKey(lat: number, lon: number): string {
  // Coarse-grain to ~10m so identical-ish coords reuse the same fetch.
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Storage key for the Last-Modified header from a previous MET
 * Locationforecast response, used to send `If-Modified-Since` next time.
 * Stored in `app_settings` so it survives app restarts.
 */
function locLmKey(key: string): string {
  return `met:loc:${key}:lm`;
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

  // Always read the cache up front — even on `force: true`, the cached
  // bundle is needed as a fallback if any provider fails. Reading is a
  // single SQLite SELECT, fast.
  const cached: ForecastBundle | null = await forecastCacheRepository.get(key);

  // Cache hit (TTL not expired) — fastest path, no network at all.
  if (!options.force) {
    const maxAge = options.maxAge ?? CACHE_TTL_MS;
    if (cached && Date.now() - Date.parse(cached.fetchedAtUtc) < maxAge) {
      return cached;
    }
  }

  const days = Math.ceil(HOURS_HORIZON / 24);

  // When we have a cached bundle and a stored Last-Modified, send a
  // conditional request to MET. If the server replies 304 Not Modified
  // we can keep the existing bundle and just refresh its timestamp —
  // saves the ~50 KB Locationforecast body. MET's terms of service
  // ask clients to use this pattern to be polite to the API.
  const ifModifiedSince = cached
    ? await settingsRepository.get(locLmKey(key))
    : null;

  // Run providers in parallel; resolve each into a status + payload independently
  // so a single provider failure doesn't kill the whole forecast.
  const [weatherR, oceanR, tideR] = await Promise.allSettled([
    fetchLocationForecast(lat, lon, { ifModifiedSince }),
    fetchOceanForecast(lat, lon),
    fetchTides(lat, lon, days),
  ]);

  const weatherFailed = weatherR.status === 'rejected';
  const oceanFailed = oceanR.status === 'rejected';
  const tideFailed = tideR.status === 'rejected';

  // ---- Failure paths ----
  // Weather is the only critical source — without it the bundle has no
  // time axis. If weather failed AND we have nothing cached, bubble up
  // the underlying error for a fullscreen retry UI.
  if (weatherFailed && !cached) {
    throw weatherR.status === 'rejected' && weatherR.reason instanceof Error
      ? weatherR.reason
      : new Error('Weather fetch failed');
  }

  // Any provider failure with a cached fallback available → throw a
  // structured error. The caller (forecast screen) keeps showing the
  // cached bundle and surfaces a "couldn't refresh" message rather than
  // poisoning the cache with a partial result. This is what fixes the
  // "airplane-mode pull-to-refresh drops the tide column" bug — tide
  // could fail while weather/ocean serve from Android's HTTP cache,
  // building a tide-less bundle that overwrote the good cache.
  if ((weatherFailed || oceanFailed || tideFailed) && cached) {
    throw new PartialFetchError({
      weatherFailed,
      oceanFailed,
      tideFailed,
      fallbackBundle: cached,
    });
  }

  // ---- Success / no-cache-fallback path ----
  // Either everything succeeded, OR we don't have a cached bundle to
  // fall back to (first-ever fetch with intermittent network) — in that
  // case we still build whatever partial bundle we can and persist it
  // so the user sees something rather than nothing.

  // We've handled `weatherFailed && !cached` above by throwing.
  // weatherR is therefore fulfilled here (`!weatherFailed`), but the type
  // narrowing doesn't propagate — assert defensively.
  if (weatherR.status !== 'fulfilled') {
    // Unreachable in practice; keeps TypeScript happy.
    throw new Error('Unexpected: weatherR not fulfilled after failure check');
  }

  // 304 Not Modified path: weather is unchanged, so the cached bundle
  // is still valid. Bump its fetchedAt so subsequent reads use the
  // fast cache-hit branch above. Ocean/tide MAY have updated, but their
  // update cadences are slower than weather (6 h / 10 min respectively)
  // and the next TTL expiry within an hour will pick those changes up.
  if (weatherR.value.notModified && cached) {
    const refreshed = { ...cached, fetchedAtUtc: new Date().toISOString() };
    await forecastCacheRepository.put(key, refreshed);
    return refreshed;
  }

  const weather = weatherR.value.data;
  const weatherStatus = 'ok' as const;
  // Persist the new Last-Modified so the next request can be conditional.
  if (weatherR.value.lastModified) {
    await settingsRepository.set(locLmKey(key), weatherR.value.lastModified);
  }

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
  // Only persist a complete bundle to the cache. A partial one would
  // poison the cache for the next launch — better to keep the previous
  // complete bundle (or nothing, if there was none).
  if (!oceanFailed && !tideFailed) {
    await forecastCacheRepository.put(key, bundle);
  }
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
