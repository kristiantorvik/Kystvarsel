import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'kystvarsel-alerts';

/**
 * Configure expo-notifications. Idempotent — safe to call on every app start.
 */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Kystvarsel',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0E3A5F',
    });
  }
}

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function getNotificationPermissionState(): Promise<PermissionState> {
  const s = await Notifications.getPermissionsAsync();
  if (s.status === 'granted' || s.granted) return 'granted';
  if (s.status === 'denied') return 'denied';
  return 'undetermined';
}

/**
 * Request notification permission. Should be called when the user enables their
 * first alert, not at app start (per spec).
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const s = await Notifications.requestPermissionsAsync();
  if (s.status === 'granted' || s.granted) return 'granted';
  if (s.status === 'denied') return 'denied';
  return 'undetermined';
}

export interface SendNotificationInput {
  title: string;
  body: string;
  /** Stable ID — used so subsequent matches with the same ID replace rather than stack. */
  id?: string;
  data?: Record<string, unknown>;
}

export async function sendLocalNotification(input: SendNotificationInput): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: input.id,
    content: {
      title: input.title,
      body: input.body,
      data: input.data,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null, // immediate
  });
}
