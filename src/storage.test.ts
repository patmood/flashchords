import { afterEach, describe, expect, it, vi } from 'vitest';
import { readStoredValue, STORAGE_KEY, WELCOME_KEY } from './storage';

afterEach(() => vi.unstubAllGlobals());

function storage(values: Record<string, string>, writable = true) {
  const data = new Map(Object.entries(values));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!writable) throw new Error('Storage is full');
      data.set(key, value);
    },
  });
  return data;
}

describe('Flashchords storage migration', () => {
  it('copies old progress without removing the original', () => {
    const data = storage({ 'little-strum.progress.v1': '{"version":1}' });
    expect(readStoredValue(STORAGE_KEY)).toBe('{"version":1}');
    expect(data.get(STORAGE_KEY)).toBe('{"version":1}');
    expect(data.get('little-strum.progress.v1')).toBe('{"version":1}');
  });

  it('preserves the welcome dismissal preference', () => {
    const data = storage({ 'little-strum.hide-welcome.v1': 'true' });
    expect(readStoredValue(WELCOME_KEY)).toBe('true');
    expect(data.get(WELCOME_KEY)).toBe('true');
  });

  it('prefers current data, including a reset, over old data', () => {
    storage({ [STORAGE_KEY]: 'new', 'little-strum.progress.v1': 'old' });
    expect(readStoredValue(STORAGE_KEY)).toBe('new');
  });

  it('can still read old data when migration cannot be saved', () => {
    storage({ 'little-strum.progress.v1': 'old' }, false);
    expect(readStoredValue(STORAGE_KEY)).toBe('old');
  });
});
