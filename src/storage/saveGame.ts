import { type GameStateSnapshot } from '../game/state';
import { storageService, type StorageService } from './storageService';

const SAVE_KEY = 'hex-save-v1';

export interface SaveRepository {
  save(snapshot: GameStateSnapshot): void;
  load(): GameStateSnapshot | null;
  hasSave(): boolean;
  clear(): void;
}

export function createSaveRepository(storage: StorageService): SaveRepository {
  return {
    save: (snapshot) => storage.setItem(SAVE_KEY, JSON.stringify(snapshot)),
    load: () => {
      const raw = storage.getItem(SAVE_KEY);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as GameStateSnapshot;
      } catch {
        return null;
      }
    },
    hasSave: () => storage.getItem(SAVE_KEY) !== null,
    clear: () => storage.removeItem(SAVE_KEY),
  };
}

export const saveRepository: SaveRepository = createSaveRepository(storageService);
