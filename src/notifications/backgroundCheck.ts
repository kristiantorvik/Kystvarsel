import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';

import { spotsRepository } from '../data/spotsRepository';
import { alertsRepository } from '../data/alertsRepository';
import {
  settingsRepository,
  SETTINGS_KEYS,
  getDailyCheckHour,
} from '../data/settingsRepository';
import { getForecastsForSpots } from '../api/forecastService';
import { evaluateAlert } from '../domain/evaluateAlert';
import { sendLocalNotification } from './localNotifications';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';

const TASK_NAME = 'kystvarsel.alert-check';

export interface AlertCheckResult {
  checked: number;
  matched: number;
  notified: number;
  /** True when the daily-check gate skipped this run (not yet time, or already done today). */
  skipped: boolean;
}

/**
 * Background fires can be early. If the user picks 07:00 and WorkManager
 * fires at 06:40, we'd rather run the check now than wait another two
 * hours for the next fire. 30 minutes is generous enough to absorb most
 * "early" wake-ups without letting the check creep noticeably earlier
 * than the user's preference.
 */
const DAILY_CHECK_GRACE_MS = 30 * 60 * 1000;

/**
 * Daily-check gate. Returns true when the alert pipeline should actually
 * run on this invocation, false to skip.
 *
 * Concept: each calendar day has a "qualifying window" that starts at
 * `prefHour:00 − 30 min` and runs until the next day's window starts.
 * The gate runs the check on the first invocation inside the current
 * window that hasn't already done so.
 *
 * Concretely:
 *   - Find the most recent window start at or before `now`. If now is past
 *     today's `prefHour:00 − 30 min`, that's today's window; otherwise
 *     yesterday's (which extends until today's window starts).
 *   - Skip if `lastCheckAt` is at or after that window start (already
 *     handled inside this window).
 *   - Otherwise run.
 *
 * The grace window means a 06:40 fire qualifies for an "07:00" schedule
 * (and updates lastCheckAt to 06:40, which prevents subsequent fires the
 * same day from re-triggering). Without it the user would have to wait
 * for the next ~2 h fire after 07:00.
 *
 * All math is in local time so DST transitions move the window with the
 * clock — using `setDate(d - 1)` (rather than `now − 24h`) keeps the
 * yesterday calculation correct across spring/autumn.
 *
 * Exported for unit tests.
 */
export function shouldRunDailyCheck(
  now: Date,
  lastCheckAt: Date | null,
  prefHour: number,
): boolean {
  const todaysWindowStart = new Date(now);
  todaysWindowStart.setHours(prefHour, 0, 0, 0);
  todaysWindowStart.setTime(todaysWindowStart.getTime() - DAILY_CHECK_GRACE_MS);

  let windowStart: Date;
  if (now.getTime() >= todaysWindowStart.getTime()) {
    windowStart = todaysWindowStart;
  } else {
    // Before today's window — yesterday's window still applies until today's begins.
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(prefHour, 0, 0, 0);
    yesterday.setTime(yesterday.getTime() - DAILY_CHECK_GRACE_MS);
    windowStart = yesterday;
  }

  if (lastCheckAt && lastCheckAt.getTime() >= windowStart.getTime()) return false;
  return true;
}

/**
 * Runs the alert evaluation pipeline: load spots & alerts, fetch forecasts
 * (one network round-trip per unique spot), evaluate each alert, and post
 * a notification per alert whose match window has changed since last trigger.
 *
 * `manual: true` (e.g. the "Sjekk nå" button) bypasses the daily-check gate
 * so the user can force a refresh whenever they want. `manual: false` (the
 * background task path) consults the gate — see {@link shouldRunDailyCheck}.
 */
export async function runAlertCheck(opts?: { manual?: boolean }): Promise<AlertCheckResult> {
  const manual = opts?.manual === true;

  if (!manual) {
    const lastIso = await settingsRepository.get(SETTINGS_KEYS.lastCheckAt);
    const lastDate = lastIso ? new Date(lastIso) : null;
    const hour = await getDailyCheckHour();
    if (!shouldRunDailyCheck(new Date(), lastDate, hour)) {
      return { checked: 0, matched: 0, notified: 0, skipped: true };
    }
  }

  const alerts = await alertsRepository.listEnabled();
  if (alerts.length === 0) {
    await settingsRepository.set(SETTINGS_KEYS.lastCheckAt, new Date().toISOString());
    return { checked: 0, matched: 0, notified: 0, skipped: false };
  }

  const allSpots = await spotsRepository.list();
  const spotsById = new Map(allSpots.map((s) => [s.id, s]));
  const usedSpots = alerts
    .map((a) => spotsById.get(a.spotId))
    .filter((s): s is NonNullable<typeof s> => !!s);

  const bundles = await getForecastsForSpots(usedSpots, { force: true });

  let matched = 0;
  let notified = 0;
  const s = strings();

  for (const alert of alerts) {
    const bundle = bundles.get(alert.spotId);
    if (!bundle) continue;

    const result = evaluateAlert(alert, bundle.hours);
    if (result.matchingHours.length === 0) continue;
    matched += 1;

    const hash = result.windowHash ?? '';
    if (hash && hash === alert.lastTriggeredWindowHash) continue; // already notified for this window

    const first = result.matchingHours[0];
    const spot = spotsById.get(alert.spotId);
    const spotName = spot?.name ?? alert.spotId;
    const title = s.alerts.notifTitle(`${alert.name} (${spotName})`);
    const body = s.alerts.notifBody(alert.message, osloLabel(first.timeUtc));

    await sendLocalNotification({
      id: `alert-${alert.id}`,
      title,
      body,
      data: { alertId: alert.id, spotId: alert.spotId },
    });
    notified += 1;
    await alertsRepository.recordTrigger(alert.id, hash, new Date().toISOString());
  }

  await settingsRepository.set(SETTINGS_KEYS.lastCheckAt, new Date().toISOString());
  return { checked: alerts.length, matched, notified, skipped: false };
}

/**
 * Define the task lazily — TaskManager.defineTask must be called at module
 * import time on Android, hence we register at the top level here.
 */
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await runAlertCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('[kystvarsel] background alert check failed', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Register the task with the OS.
 *
 * The 2-hour minimum interval is intentionally tighter than the once-per-day
 * actual work: WorkManager (Android) treats `minimumInterval` as a *floor*,
 * not a target — actual fires can be delayed by Doze, battery saver, and
 * network conditions. To reliably hit the user's preferred daily check time
 * within an hour or two, we let the task wake up several times per day; the
 * gate inside `runAlertCheck` makes sure only the first wake-up after the
 * preferred time actually does any work. Wake-ups that hit the gate exit
 * within milliseconds, so the extra wake-ups are nearly free.
 *
 * On iOS the OS may skip executions entirely; that's a known limitation.
 */
export async function registerBackgroundCheck(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: 2 * 60, // minutes
      });
    }
  } catch (e) {
    console.warn('[kystvarsel] background task unavailable', e);
  }
}

export async function unregisterBackgroundCheck(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (isRegistered) await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  } catch {
    // ignore
  }
}
