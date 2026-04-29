import { spotsRepository } from './spotsRepository';
import { alertsRepository } from './alertsRepository';
import { forecastCacheRepository } from './forecastCacheRepository';
import { evaluateAlert } from '../domain/evaluateAlert';
import type { Spot } from '../domain/alertTypes';

export type SpotStatus = 'plain' | 'alert' | 'matching';

export interface SpotMarker {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: SpotStatus;
}

/**
 * Forecast-cache key: must match the spotKey() in api/forecastService.ts.
 * Keep in sync if you change the keying strategy there.
 */
function cacheKey(spot: Spot): string {
  return `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`;
}

/**
 * Build a list of map markers with status colours derived from cached
 * forecasts. **Does not fetch** — it relies on whatever is in the cache,
 * so the UI returns instantly. Call runAlertCheck() before this if you
 * want fresh results.
 *
 *   plain    — no enabled alerts on this spot
 *   alert    — has enabled alerts, but cache is empty or no alert matches
 *   matching — has at least one enabled alert that matches the cache
 */
export async function buildSpotMarkers(): Promise<SpotMarker[]> {
  const [spots, enabledAlerts] = await Promise.all([
    spotsRepository.list(),
    alertsRepository.listEnabled(),
  ]);

  const alertsBySpot = new Map<string, typeof enabledAlerts>();
  for (const a of enabledAlerts) {
    const arr = alertsBySpot.get(a.spotId) ?? [];
    arr.push(a);
    alertsBySpot.set(a.spotId, arr);
  }

  const markers: SpotMarker[] = [];
  for (const spot of spots) {
    const spotAlerts = alertsBySpot.get(spot.id) ?? [];
    let status: SpotStatus = 'plain';

    if (spotAlerts.length > 0) {
      status = 'alert';
      const cached = await forecastCacheRepository.get(cacheKey(spot));
      if (cached) {
        for (const alert of spotAlerts) {
          const r = evaluateAlert(alert, cached.hours);
          if (r.matchingHours.length > 0) {
            status = 'matching';
            break;
          }
        }
      }
    }

    markers.push({
      id: spot.id,
      name: spot.name,
      lat: spot.latitude,
      lon: spot.longitude,
      status,
    });
  }
  return markers;
}
