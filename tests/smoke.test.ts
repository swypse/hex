import { describe, expect, it } from 'vitest';
import { Application, Container, Graphics } from 'pixi.js';
import { muzzleParticleParams, MUZZLE_COUNT, spawnMuzzleSmoke } from '../src/render/smoke';

function seqRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('muzzleParticleParams', () => {
  it('produces params within the allowed ranges', () => {
    for (let i = 0; i < 50; i++) {
      const p = muzzleParticleParams(seqRng(i + 1));
      expect([0x222222, 0x444444, 0xffffff]).toContain(p.color);
      expect(p.opacity).toBeGreaterThanOrEqual(0.2);
      expect(p.opacity).toBeLessThan(0.7);
      expect(p.start).toBeGreaterThanOrEqual(6);
      expect(p.start).toBeLessThan(8);
      expect(p.end).toBeGreaterThanOrEqual(12);
      expect(p.end).toBeLessThan(16);
    }
  });
});

describe('spawnMuzzleSmoke', () => {
  it('adds a container with 10 squares that fade and are removed after ~1350ms', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const mapRoot = new Container();

    const realNow = (globalThis as { performance: Performance }).performance.now;
    let now = 1000;
    (globalThis as { performance: Performance }).performance.now = () => now;
    try {
      spawnMuzzleSmoke(app, mapRoot, 50, 50);

      expect(mapRoot.children).toHaveLength(1);
      const el = mapRoot.children[0] as Container;
      expect(el.children).toHaveLength(MUZZLE_COUNT);
      expect(el.children.every((c) => c instanceof Graphics)).toBe(true);
      expect(callbacks).toHaveLength(1);

      const squares = el.children as Graphics[];
      const w0 = squares.map((g) => g.getBounds().width);
      now = 1300;
      callbacks[0]!();
      // 300ms in: past max stagger (150) and before the 1200ms end, so every
      // particle has a strictly larger size.
      const w1 = squares.map((g) => g.getBounds().width);
      for (let i = 0; i < squares.length; i++) {
        expect(w1[i]!).toBeGreaterThan(w0[i]!);
      }
      expect(squares.some((g) => g.alpha > 0)).toBe(true);

      now = 2600;
      callbacks[0]!();
      expect(mapRoot.children).toHaveLength(0);
    } finally {
      (globalThis as { performance: Performance }).performance.now = realNow;
    }
  });
});