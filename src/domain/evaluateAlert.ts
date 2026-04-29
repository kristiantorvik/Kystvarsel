import type { Alert, AlertCriteria } from './alertTypes';
import type { HourlyForecast } from './forecastTypes';
import { osloHourMinute } from '../utils/time';

export interface HourEvaluation {
  hour: HourlyForecast;
  matches: boolean;
  /** Reasons the hour did NOT match (empty if matches). */
  failedReasons: string[];
}

export interface AlertEvaluation {
  alertId: string;
  evaluations: HourEvaluation[];
  matchingHours: HourlyForecast[];
  /** Stable hash describing this match window — used for notification deduplication. */
  windowHash: string | null;
}

/**
 * Evaluate an alert against a list of hourly forecasts.
 * An hour "matches" if every enabled criterion passes.
 * Missing data on a criterion that requires it = does not match (and includes a reason).
 */
export function evaluateAlert(alert: Alert, hours: HourlyForecast[]): AlertEvaluation {
  const evaluations: HourEvaluation[] = hours.map((h) => evaluateHour(alert, h));
  const matching = evaluations.filter((e) => e.matches).map((e) => e.hour);
  const windowHash = matching.length > 0 ? computeWindowHash(alert.id, matching) : null;
  return {
    alertId: alert.id,
    evaluations,
    matchingHours: matching,
    windowHash,
  };
}

function evaluateHour(alert: Alert, hour: HourlyForecast): HourEvaluation {
  const reasons: string[] = [];

  // Time-of-day window (Europe/Oslo).
  if (!isWithinTimeWindow(hour.timeLocal, alert.timeOfDayStart, alert.timeOfDayEnd)) {
    reasons.push('timeOfDay');
  }

  const c = alert.criteria;

  // Rain.
  if (c.rainMode === 'no_rain') {
    if (hour.precipitationMm == null) reasons.push('precipitation:missing');
    else if (hour.precipitationMm > 0) reasons.push('precipitation:rain');
  } else if (c.rainMode === 'max_precipitation' && c.maxPrecipitationMm != null) {
    if (hour.precipitationMm == null) reasons.push('precipitation:missing');
    else if (hour.precipitationMm > c.maxPrecipitationMm) reasons.push('precipitation:tooMuch');
  }

  checkRange(reasons, 'wind', hour.windSpeedMs, c.minWindSpeedMs, c.maxWindSpeedMs);
  checkRange(reasons, 'current', hour.currentSpeedMs, c.minCurrentSpeedMs, c.maxCurrentSpeedMs);
  checkRange(reasons, 'seaTemp', hour.seaWaterTemperatureC, c.minSeaTemperatureC, c.maxSeaTemperatureC);
  checkRange(reasons, 'tide', hour.tideLevelCm, c.minTideLevelCm, c.maxTideLevelCm);
  checkRange(reasons, 'wave', hour.waveHeightM, c.minWaveHeightM, c.maxWaveHeightM);

  if (c.tideDirection && c.tideDirection !== 'any') {
    if (hour.tideDirection == null || hour.tideDirection === 'unknown') {
      reasons.push('tideDirection:missing');
    } else if (hour.tideDirection !== c.tideDirection) {
      reasons.push('tideDirection:wrong');
    }
  }

  return { hour, matches: reasons.length === 0, failedReasons: reasons };
}

function checkRange(
  reasons: string[],
  label: string,
  value: number | undefined,
  min: number | undefined,
  max: number | undefined,
): void {
  if (min == null && max == null) return;
  if (value == null) {
    reasons.push(`${label}:missing`);
    return;
  }
  if (min != null && value < min) reasons.push(`${label}:belowMin`);
  if (max != null && value > max) reasons.push(`${label}:aboveMax`);
}

/**
 * Time-of-day window check. start is inclusive, end is exclusive.
 * Supports overnight windows where start > end (e.g. 22:00–04:00).
 */
export function isWithinTimeWindow(
  timeLocal: string,
  start: string,
  end: string,
): boolean {
  const t = osloHourMinute(timeLocal);
  if (t == null) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return true; // be permissive on bad config
  if (s === e) return true; // empty/full window — treat as 24h
  if (s < e) return t >= s && t < e;
  return t >= s || t < e;
}

function parseHHMM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

/**
 * Stable hash describing a match window. The hash is used to skip duplicate
 * notifications when the same alert continues to match the same forecast slice.
 *
 * Hash inputs: alert id + first matching UTC hour + last matching UTC hour
 * + count of matches + sorted local-date list.
 */
export function computeWindowHash(alertId: string, matching: HourlyForecast[]): string {
  if (matching.length === 0) return '';
  const first = matching[0].timeUtc;
  const last = matching[matching.length - 1].timeUtc;
  const dates = [...new Set(matching.map((m) => m.timeLocal.slice(0, 10)))].sort().join(',');
  const raw = `${alertId}|${first}|${last}|${matching.length}|${dates}`;
  return fnv1a(raw);
}

/** Tiny stable hash — good enough for "is this the same window" comparison. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
