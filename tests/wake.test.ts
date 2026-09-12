import { describe, expect, it } from 'vitest';
import { wakeSquarePositions } from '../src/render/wake';

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