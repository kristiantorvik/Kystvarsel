import * as Crypto from 'expo-crypto';

/**
 * Generate a UUID v4. Uses expo-crypto.randomUUID under the hood.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
