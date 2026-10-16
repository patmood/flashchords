export const STORAGE_KEY = 'flashchords.progress.v1';
export const WELCOME_KEY = 'flashchords.hide-welcome.v1';

/** Preserve existing same-origin data when upgrading from the previous name. */
export function readStoredValue(key: string): string | null {
  const current = localStorage.getItem(key);
  if (current !== null) return current;
  const legacy = localStorage.getItem(key.replace(/^flashchords\./, 'little-strum.'));
  if (legacy !== null) {
    try { localStorage.setItem(key, legacy); }
    catch { /* Keep reading the original if storage is full or read-only. */ }
  }
  return legacy;
}
