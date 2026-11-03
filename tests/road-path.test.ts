import { describe, expect, it } from 'vitest';
import { roadStripOutline } from '../src/render/road-path';

describe('roadStripOutline', () => {
  const seed = { q: 3, r: -2, edge: 4 };

  it('is deterministic for the same seed', () => {
    expect(roadStripOutline(0, 0, 30, 10, 2, seed)).toEqual(roadStripOutline(0, 0, 30, 10, 2, seed));
  });

  it('keeps both ends on the edge midpoint and the centre', () => {
    const pts = roadStripOutline(0, 0, 30, 0, 2, seed);
    // First left point and last right point bracket the start; the middle pair brackets the end.
    const n = pts.length / 2;
    const first = [(pts[0]! + pts[pts.length - 2]!) / 2, (pts[1]! + pts[pts.length - 1]!) / 2];
    const last = [(pts[n - 2]! + pts[n]!) / 2, (pts[n - 1]! + pts[n + 1]!) / 2];
    expect(first[0]).toBeCloseTo(0, 5);
    expect(first[1]).toBeCloseTo(0, 5);
    expect(last[0]).toBeCloseTo(30, 5);
    expect(last[1]).toBeCloseTo(0, 5);
  });

  it('is not a straight strip', () => {
    const pts = roadStripOutline(0, 0, 40, 0, 2, seed);
    const ys = pts.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(4.5);
  });
});
