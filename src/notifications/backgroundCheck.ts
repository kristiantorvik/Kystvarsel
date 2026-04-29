import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';

import { spotsRepository } from '../data/spotsRepository';
import { alertsRepository } from '../data/alertsRepository';
import { settingsRepository, SETTINGS_KEYS } from '../data/settingsRepository';
import { getForecastsForSpots } from '../api/forecastService';
import { evaluateAlert } from '../domain/evaluateAlert';
import { sendLocalNotification } from './localNotifications';
import { strings } from '../i18n';
import { osloLabel } from '../utils/time';

const TASK_NAME = 'kystvarsel.alert-check';

/**
 * Runs the alert evaluation pipeline: load spots & alerts, fetch forecasts
 * (one network round-trip per unique spot), evaluate each alert, and post
 * a notification per alert whose match window has changed since last trigger.
 *
 * Returns a summary suitable for the manual "Check now" UI feedback.
 */
export async function runAlertCheck(): Promise<{ checked: number; matched: number; notified: number }> {
  const alerts = await alertsRepository.listEnabled();
  if (alerts.length === 0) {
    await settingsRepository.set(SETTINGS_KEYS.lastCheckAt, new Date().toISOString());
    return { checked: 0, matched: 0, notified: 0 };
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
  return { checked: alerts.length, matched, notified };
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
 * Register the task with the OS. The 12-hour cadence is best-effort — on
 * Android it's enforced by WorkManager which may delay the task based on
 * battery, network, and Doze. On iOS the OS may skip executions entirely.
 */
export async function registerBackgroundCheck(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return;

    const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(TASK_NAME, {
        minimumInterval: 12 * 60, // minutes
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
