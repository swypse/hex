import { describe, it, expect } from 'vitest';
import {
  generatePlayerNames,
  generateVillageNames,
} from '../src/game/names';
import { playerNameWords, villageNameWords } from '../src/i18n/lists';
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

  it('generates village names from the village word pools', () => {
    const names = generateVillageNames(4, new SeededRandom(9));
    expect(names).toHaveLength(4);
    expect(new Set(names).size).toBe(4);
    for (const name of names) {
      expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    }
    expect(villageNameWords().adjectives).toHaveLength(10);
    expect(villageNameWords().nouns).toHaveLength(10);
  });
});