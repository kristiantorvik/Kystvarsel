import { spotsRepository } from './spotsRepository';
import { forecastCacheRepository } from './forecastCacheRepository';
import { evaluateAlert } from '../domain/evaluateAlert';
import type { Alert } from '../domain/alertTypes';

/**
 * For a list of alerts, returns a map of alertId → matches-cached-forecast?
 *
 * Mirrors `buildSpotMarkers` in spotStatus.ts but per-alert: lets the alerts
 * list highlight rows that currently match. **Reads cache only** — does not
 * fetch from network. Run `runAlertCheck()` first if you need fresh data.
 *
 * Disabled alerts always return false.
 */
export async function buildAlertMatchMap(alerts: Alert[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (alerts.length === 0) return out;

  // Load only the spots referenced by these alerts.
  const spotIds = [...new Set(alerts.map((a) => a.spotId))];
  const spots = await Promise.all(spotIds.map((id) => spotsRepository.get(id)));
  const spotMap = new Map(
    spots
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => [s.id, s] as const),
  );

  for (const alert of alerts) {
    if (!alert.enabled) {
      out.set(alert.id, false);
      continue;
    }
    const spot = spotMap.get(alert.spotId);
    if (!spot) {
      out.set(alert.id, false);
      continue;
    }
    const cacheKey = `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`;
    const cached = await forecastCacheRepository.get(cacheKey);
    if (!cached) {
      out.set(alert.id, false);
      continue;
    }
    const r = evaluateAlert(alert, cached.hours);
    out.set(alert.id, r.matchingHours.length > 0);
  }
  return out;
}
