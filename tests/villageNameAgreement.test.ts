import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../src/storage/storageService';
import { setLanguage } from '../src/storage/settings';
import { generateVillageNames } from '../src/game/names';
import { localizeVillageName } from '../src/i18n/lists';
import { SeededRandom } from '../src/util/random';

function fakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.spyOn(storageService, 'getItem').mockImplementation((k) => store.get(k) ?? null);
  vi.spyOn(storageService, 'setItem').mockImplementation((k, v) => {
    store.set(k, v);
  });
  return store;
}

describe('Russian village name agreement', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('localizes English names with the adjective agreeing with the noun', () => {
    fakeStorage();
    setLanguage('ru');
    expect(localizeVillageName('Old Pines')).toBe('Старые Сосны');
    expect(localizeVillageName('Old Rock')).toBe('Старая Скала');
    expect(localizeVillageName('Old Gate')).toBe('Старые Ворота');
    expect(localizeVillageName('Old Oak')).toBe('Старый Дуб');
    expect(localizeVillageName('Golden Meadow')).toBe('Золотой Луг');
    expect(localizeVillageName('High Rock')).toBe('Высокая Скала');
  });

  it('fixes legacy mismatched Russian names and is idempotent on agreed ones', () => {
    fakeStorage();
    setLanguage('ru');
    // Names saved before the fix stored the adjective in masculine form for every noun.
    expect(localizeVillageName('Старый Сосны')).toBe('Старые Сосны');
    expect(localizeVillageName('Старый Скала')).toBe('Старая Скала');
    expect(localizeVillageName('Старый Ворота')).toBe('Старые Ворота');
    expect(localizeVillageName('Старые Сосны')).toBe('Старые Сосны');
    expect(localizeVillageName('Старая Скала')).toBe('Старая Скала');
  });

  it('round-trips inflected Russian names back to English', () => {
    fakeStorage();
    setLanguage('en');
    expect(localizeVillageName('Старые Сосны')).toBe('Old Pines');
    expect(localizeVillageName('Старая Скала')).toBe('Old Rock');
    expect(localizeVillageName('Золотые Ворота')).toBe('Golden Gate');
  });

  it('generates only agreeing Russian names for every adjective/noun pair', () => {
    fakeStorage();
    setLanguage('ru');
    // 10x10 pools → 100 combos; requesting the full pool exercises every pair.
    const names = generateVillageNames(100, new SeededRandom(3));
    expect(names).toHaveLength(100);
    expect(new Set(names).size).toBe(100);
    for (const name of names) {
      // Re-localizing an already-agreed name must be a no-op; a masculine
      // adjective on a feminine/plural noun would come back changed.
      expect(localizeVillageName(name)).toBe(name);
    }
  });
});
