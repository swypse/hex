import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_MATCH_TTL_MS, createActiveMatchStore, type ActiveMatchStore } from '../src/storage/active-match';
import { type StorageService } from '../src/storage/storage-service';

const KEY = 'hex-active-match-v1';

function fakeStorage(): StorageService & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('activeMatchStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves and loads a fresh match', () => {
    const storage = fakeStorage();
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    store.save('ABC234', 'Guest', 'wss://relay.example/ws');
    expect(store.loadFresh()).toEqual({
      role: 'client',
      code: 'ABC234',
      name: 'Guest',
      relayUrl: 'wss://relay.example/ws',
      savedAt: Date.now(),
    });
  });

  it('defaults to an empty relay url when the record has none', () => {
    const storage = fakeStorage();
    storage.setItem(KEY, JSON.stringify({ role: 'client', code: 'ABC234', name: 'Guest', savedAt: Date.now() }));
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    expect(store.loadFresh()!.relayUrl).toBe('');
  });

  it('returns null when nothing is stored', () => {
    const storage = fakeStorage();
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    expect(store.loadFresh()).toBeNull();
  });

  it('expires a match after the TTL and clears the storage', () => {
    const storage = fakeStorage();
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    store.save('ABC234', 'Guest', '');
    vi.advanceTimersByTime(ACTIVE_MATCH_TTL_MS + 1);
    expect(store.loadFresh()).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('keeps a match within the TTL', () => {
    const storage = fakeStorage();
    const store: ActiveMatchStore = createActiveMatchStore(storage, 10_000);
    store.save('ABC234', 'Guest', '');
    vi.advanceTimersByTime(9_999);
    expect(store.loadFresh()).not.toBeNull();
  });

  it('clears and returns null for corrupt json', () => {
    const storage = fakeStorage();
    storage.setItem(KEY, 'not json');
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    expect(store.loadFresh()).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('clears and returns null for a malformed record', () => {
    const storage = fakeStorage();
    storage.setItem(KEY, JSON.stringify({ role: 'host' }));
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    expect(store.loadFresh()).toBeNull();
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('clear removes the stored match', () => {
    const storage = fakeStorage();
    const store: ActiveMatchStore = createActiveMatchStore(storage);
    store.save('ABC234', 'Guest', '');
    store.clear();
    expect(store.loadFresh()).toBeNull();
  });
});