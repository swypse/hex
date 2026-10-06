import { describe, expect, it } from 'vitest';
import { easeInOutCubic, easeOutBack, easeOutCubic } from '../src/util/easing';
import { clamp, clamp01, lerp, median } from '../src/util/math';
import { pickRandom, randomInt, randomSeed } from '../src/util/random';

describe('math utils', () => {
  it('clamps into the range, lo winning when inverted', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp(5, 4, 1)).toBe(4);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });

  it('computes the median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('interpolates linearly', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const f of [easeOutCubic, easeInOutCubic, easeOutBack]) {
      expect(f(0)).toBeCloseTo(0);
      expect(f(1)).toBeCloseTo(1);
      expect(f(2)).toBeCloseTo(1);
    }
  });

  it('overshoots 1 with easeOutBack', () => {
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });
});

describe('random utils', () => {
  it('picks within the list and returns undefined for an empty one', () => {
    expect(pickRandom(['a', 'b', 'c'], () => 0)).toBe('a');
    expect(pickRandom(['a', 'b', 'c'], () => 0.999)).toBe('c');
    expect(pickRandom([], () => 0.5)).toBeUndefined();
  });

  it('draws inclusive integers', () => {
    expect(randomInt(2, 4, () => 0)).toBe(2);
    expect(randomInt(2, 4, () => 0.999)).toBe(4);
    const seed = randomSeed();
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(100000);
  });
});
