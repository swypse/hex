import { afterEach, describe, expect, it, vi } from 'vitest';
import { storageService } from '../src/storage/storage-service';
import { setLanguage } from '../src/storage/settings';
import { generateVillageNames } from '../src/game/names';
import { localizeVillageName } from '../src/i18n/lists';
import { SeededRandom } from '../src/util/random';
import { Language } from '@enums';

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
    setLanguage(Language.RU);
    expect(localizeVillageName('Old Pines')).toBe('Старые Сосны');
    expect(localizeVillageName('Old Rock')).toBe('Старая Скала');
    expect(localizeVillageName('Old Gate')).toBe('Старые Ворота');
    expect(localizeVillageName('Old Oak')).toBe('Старый Дуб');
    expect(localizeVillageName('Golden Meadow')).toBe('Золотой Луг');
    expect(localizeVillageName('High Rock')).toBe('Высокая Скала');
  });

  it('fixes legacy mismatched Russian names and is idempotent on agreed ones', () => {
    fakeStorage();
    setLanguage(Language.RU);
    // Names saved before the fix stored the adjective in masculine form for every noun.
    expect(localizeVillageName('Старый Сосны')).toBe('Старые Сосны');
    expect(localizeVillageName('Старый Скала')).toBe('Старая Скала');
    expect(localizeVillageName('Старый Ворота')).toBe('Старые Ворота');
    expect(localizeVillageName('Старые Сосны')).toBe('Старые Сосны');
    expect(localizeVillageName('Старая Скала')).toBe('Старая Скала');
  });

  it('round-trips inflected Russian names back to English', () => {
    fakeStorage();
    setLanguage(Language.EN);
    expect(localizeVillageName('Старые Сосны')).toBe('Old Pines');
    expect(localizeVillageName('Старая Скала')).toBe('Old Rock');
    expect(localizeVillageName('Золотые Ворота')).toBe('Golden Gate');
  });

  it('generates Russian city-style names that localization leaves unchanged', () => {
    fakeStorage();
    setLanguage(Language.RU);
    const names = generateVillageNames(100, new SeededRandom(3));
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[А-ЯЁ][а-яё]+-[а-яё]+$/);
      expect(localizeVillageName(name)).toBe(name);
    }
  });

  it('translates city-style names between English and Russian', () => {
    fakeStorage();
    setLanguage(Language.RU);
    expect(localizeVillageName('Foxburg')).toBe('Фокс-бург');
    expect(localizeVillageName('Wolftown')).toBe('Волф-таун');
    expect(localizeVillageName('Sharkcity')).toBe('Шарк-сити');
    setLanguage(Language.EN);
    expect(localizeVillageName('Фокс-бург')).toBe('Foxburg');
    expect(localizeVillageName('Бир-вилль')).toBe('Bearville');
    expect(localizeVillageName('Deerfield')).toBe('Deerfield');
  });
});
