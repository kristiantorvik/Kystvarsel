import Constants from 'expo-constants';

/**
 * MET Norway requires a meaningful User-Agent. Expo's app config carries
 * the contact email in `expo.extra.metContactEmail` so it's easy to change.
 */
export function getUserAgent(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { metContactEmail?: string; appIdentifier?: string };
  const id = extra.appIdentifier ?? 'kystvarsel';
  const version = Constants.expoConfig?.version ?? '0.1.0';
  const contact = extra.metContactEmail ?? 'unknown@example.com';
  return `${id}/${version} ${contact}`;
}
