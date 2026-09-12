import { describe, expect, it } from 'vitest';
import { Application, Container, Graphics } from 'pixi.js';
import { spawnShipWake, wakeSquarePositions } from '../src/render/wake';

function seqRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('wakeSquarePositions', () => {
  it('returns exactly the requested number of points', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 100, y: 0 }, 15, seqRng(7));
    expect(pts).toHaveLength(15);
    expect(pts.every((p) => p.x >= 0 && p.x <= 100)).toBe(true);
  });

  it('scatters points along the segment with small perpendicular jitter', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 100, y: 0 }, 20, seqRng(3));
    const xs = pts.map((p) => p.x);
    expect(Math.min(...xs)).toBeLessThan(50);
    expect(Math.max(...xs)).toBeGreaterThan(50);
    expect(pts.every((p) => Math.abs(p.y) <= 8)).toBe(true);
  });

  it('works for a diagonal segment', () => {
    const pts = wakeSquarePositions({ x: 0, y: 0 }, { x: 60, y: 30 }, 12, seqRng(11));
    expect(pts).toHaveLength(12);
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(-8);
      expect(p.x).toBeLessThanOrEqual(68);
      expect(p.y).toBeGreaterThanOrEqual(-8);
      expect(p.y).toBeLessThanOrEqual(38);
    }
  });
});

describe('spawnShipWake', () => {
  it('spawns 10-20 light-blue rects on the container that fade out and are removed after 200ms', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const container = new Container();
    container.sortableChildren = true;

    const realNow = (globalThis as { performance: Performance }).performance.now;
    let now = 1000;
    (globalThis as { performance: Performance }).performance.now = () => now;
    try {
      spawnShipWake(app, container, { x: 0, y: 0 }, { x: 100, y: 0 });

      const rects = container.children.filter((c) => c instanceof Graphics);
      expect(rects.length).toBeGreaterThanOrEqual(10);
      expect(rects.length).toBeLessThanOrEqual(20);
      expect(rects.every((g) => g.zIndex === 5)).toBe(true);
      expect(callbacks).toHaveLength(1);

      const fn = callbacks[0]!;
      now = 1100;
      fn();
      expect(rects.every((g) => g.alpha > 0 && g.alpha < 1)).toBe(true);

      now = 1300;
      fn();
      expect(container.children.length).toBe(0);
    } finally {
      (globalThis as { performance: Performance }).performance.now = realNow;
    }
  });
});