import { nb, type Strings } from './nb';

let current: Strings = nb;

export function setLanguage(lang: 'nb'): void {
  // English translation can be added later — keep this in place to make it cheap.
  if (lang === 'nb') current = nb;
}

/**
 * Look up a string by dot path. Returns the path itself if missing, so a typo
 * is visible in the UI rather than crashing.
 */
export function t(path: string): string {
  const parts = path.split('.');
  let node: any = current;
  for (const p of parts) {
    if (node == null) return path;
    node = node[p];
  }
  return typeof node === 'string' ? node : path;
}

/** Direct access for parameterised strings (functions in the dictionary). */
export const strings = (): Strings => current;
