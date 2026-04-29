/**
 * Time utilities for converting between UTC and Europe/Oslo local time.
 * We keep storage/comparison in UTC; only formatting and time-of-day window
 * checks use Oslo local time.
 */

const OSLO = 'Europe/Oslo';

const osloFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: OSLO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/**
 * Convert a UTC ISO string to Oslo-local "YYYY-MM-DDTHH:MM" (no timezone suffix).
 */
export function toOsloLocalString(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return isoUtc;
  const parts = osloFormatter.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  let hour = get('hour');
  if (hour === '24') hour = '00'; // Intl quirk in some engines
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/**
 * Extract minute-of-day (0..1439) from an Oslo-local timestamp string.
 */
export function osloHourMinute(timeLocal: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(timeLocal);
  if (!m) return null;
  const hh = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh * 60 + mm;
}

/**
 * Format a UTC ISO timestamp as a short Oslo-local label, e.g. "ma. 27. apr. 16:00".
 */
const osloLabelFormatter = new Intl.DateTimeFormat('nb-NO', {
  timeZone: OSLO,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function osloLabel(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (isNaN(d.getTime())) return isoUtc;
  return osloLabelFormatter.format(d);
}

/**
 * Truncate a Date to the start of its UTC hour and return ISO string.
 */
export function utcHourIso(d: Date = new Date()): string {
  const c = new Date(d.getTime());
  c.setUTCMinutes(0, 0, 0);
  return c.toISOString().replace('.000Z', 'Z');
}

/**
 * Add hours to a Date.
 */
export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600_000);
}
