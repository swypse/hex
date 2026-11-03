import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../src/util/random';

describe('SeededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int returns values within inclusive bounds', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('pick returns an element of the array', () => {
    const rng = new SeededRandom(7);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle preserves all elements', () => {
    const rng = new SeededRandom(7);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
  });
});
