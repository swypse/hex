import { describe, it, expect } from 'vitest';
import { createPerlin } from '../src/game/perlin';

describe('perlin noise', () => {
  it('is deterministic for the same seed', () => {
    const a = createPerlin(42);
    const b = createPerlin(42);
    for (const [x, y] of [[0.3, 0.7], [12.4, -5.2], [1, 1]] as [number, number][]) {
      expect(a(x, y)).toBe(b(x, y));
    }
  });

  it('returns values in [0, 1]', () => {
    const noise = createPerlin(7);
    for (let i = 0; i < 1000; i++) {
      const x = (i * 0.37) % 10;
      const y = (i * 0.91) % 10;
      const v = noise(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('produces different outputs for different seeds', () => {
    const a = createPerlin(1);
    const b = createPerlin(2);
    const points: [number, number][] = [
      [3.5, 2.5],
      [1.3, 4.7],
      [0.1, 0.9],
      [6.2, 1.8],
      [2.9, 5.4],
    ];
    expect(points.some(([x, y]) => a(x, y) !== b(x, y))).toBe(true);
  });

  it('is smooth: nearby points have close values', () => {
    const noise = createPerlin(99);
    const center = noise(5.5, 5.5);
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        expect(Math.abs(noise(5.5 + dx, 5.5 + dy) - center)).toBeLessThan(0.5);
      }
    }
  });
});
