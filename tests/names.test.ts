import { describe, it, expect } from 'vitest';
import {
  generatePlayerNames,
  generateVillageNames,
} from '../src/game/names';
import { playerNameWords, villageAnimalNames } from '../src/i18n/lists';
import { SeededRandom } from '../src/util/random';

describe('names', () => {
  it('has 10 adjectives and 10 animals per language', () => {
    expect(playerNameWords().adjectives).toHaveLength(10);
    expect(playerNameWords().animals).toHaveLength(10);
  });

  it('generates the requested count of names, all unique and capitalized', () => {
    const names = generatePlayerNames(3, new SeededRandom(42));
    expect(names).toHaveLength(3);
    expect(new Set(names).size).toBe(3);
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
  });

  it('is deterministic for a fixed seed', () => {
    const a = generatePlayerNames(2, new SeededRandom(7));
    const b = generatePlayerNames(2, new SeededRandom(7));
    expect(a).toEqual(b);
  });

  it('generates city-style village names: an animal plus a suffix', () => {
    const names = generateVillageNames(4, new SeededRandom(9));
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+(town|ville|city|burg|port|field)$/);
    }
  });

  it('never names two villages after the same animal, even with every name requested', () => {
    const all = villageAnimalNames();
    const names = generateVillageNames(all.length, new SeededRandom(5));
    expect(names).toHaveLength(all.length);
    expect(new Set(names).size).toBe(all.length);
    // The largest game (7 players) needs 14 villages: the pool must cover it.
    expect(all.length).toBeGreaterThanOrEqual(14);
  });

  it('is deterministic for a fixed seed (village names)', () => {
    expect(generateVillageNames(6, new SeededRandom(11))).toEqual(generateVillageNames(6, new SeededRandom(11)));
  });
});