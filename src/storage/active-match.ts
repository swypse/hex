import { storageService, type StorageService } from './storage-service';

const ACTIVE_MATCH_KEY = 'hex-active-match-v1';

/** How long a saved multiplayer client match stays offered on the start screen
 *  before it is treated as a dead room and dropped. */
export const ACTIVE_MATCH_TTL_MS = 45 * 60 * 1000;

export interface ActiveClientMatch {
  role: 'client';
  code: string;
  name: string;
  /** Relay the room was on, so rejoin uses the same transport (e.g. a
   *  self-hosted relay while the Cloudflare one is blocked). Empty = default. */
  relayUrl: string;
  savedAt: number;
}

export interface ActiveMatchStore {
  save(code: string, name: string, relayUrl: string): void;
  clear(): void;
  /** The stored match when it is still fresh; clears (and nulls) a stale or
   *  corrupt entry. */
  loadFresh(): ActiveClientMatch | null;
}

export function createActiveMatchStore(storage: StorageService, ttlMs: number = ACTIVE_MATCH_TTL_MS): ActiveMatchStore {
  const save = (code: string, name: string, relayUrl: string): void => {
    const record: ActiveClientMatch = { role: 'client', code, name, relayUrl, savedAt: Date.now() };
    try {
      storage.setItem(ACTIVE_MATCH_KEY, JSON.stringify(record));
    } catch {
      // storage unavailable — rejoin simply won't be offered.
    }
  };

  const clear = (): void => {
    try {
      storage.removeItem(ACTIVE_MATCH_KEY);
    } catch {
      // ignore
    }
  };

  const loadFresh = (): ActiveClientMatch | null => {
    try {
      const raw = storage.getItem(ACTIVE_MATCH_KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) {
        clear();
        return null;
      }
      const rec = parsed as Partial<ActiveClientMatch>;
      if (
        rec.role !== 'client' ||
        typeof rec.code !== 'string' ||
        typeof rec.name !== 'string' ||
        typeof rec.savedAt !== 'number'
      ) {
        clear();
        return null;
      }
      if (Date.now() - rec.savedAt > ttlMs) {
        clear();
        return null;
      }
      return {
        role: 'client',
        code: rec.code,
        name: rec.name,
        relayUrl: typeof rec.relayUrl === 'string' ? rec.relayUrl : '',
        savedAt: rec.savedAt,
      };
    } catch {
      clear();
      return null;
    }
  };

  return { save, clear, loadFresh };
}

export const activeMatchStore: ActiveMatchStore = createActiveMatchStore(storageService);