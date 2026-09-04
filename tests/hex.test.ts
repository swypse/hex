import { describe, it, expect } from 'vitest';
import {
  allTiles,
  axialKey,
  compareTileY,
  HEX_TILT,
  hexCorners,
  hexDistance,
  hexEdge,
  hexEdgeNeighbor,
  hexNeighbors,
  hexToPixel,
  pixelToHex,
  ringOf,
  splitHexBorder,
  tilesInRange,
} from '../src/game/hex';

describe('hex math', () => {
  it('computes distance for adjacent tiles', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });

  it('hexDistance is symmetric', () => {
    const a = { q: 2, r: -1 };
    const b = { q: -1, r: 1 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('returns 6 unique neighbors', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
    expect(new Set(neighbors.map(axialKey)).size).toBe(6);
  });

  it('ringOf returns tiles at exact distance', () => {
    const center = { q: 0, r: 0 };
    const ring = ringOf(center, 2);
    expect(ring).toHaveLength(12);
    for (const tile of ring) {
      expect(hexDistance(center, tile)).toBe(2);
    }
  });

  it('tilesInRange includes center and ring', () => {
    expect(tilesInRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });

  it('allTiles produces 3R(R+1)+1 tiles', () => {
    expect(allTiles(4)).toHaveLength(61);
    expect(allTiles(5)).toHaveLength(91);
  });

  it('hexToPixel maps distinct hexes to distinct pixels', () => {
    const a = hexToPixel({ q: 0, r: 0 }, 40);
    const b = hexToPixel({ q: 1, r: 0 }, 40);
    expect(a).not.toEqual(b);
  });

  it('pixelToHex inverts hexToPixel', () => {
    const coords = [
      { q: 0, r: 0 },
      { q: 3, r: -2 },
      { q: -1, r: 4 },
      { q: 2, r: 1 },
    ];
    for (const h of coords) {
      const p = hexToPixel(h, 40);
      expect(pixelToHex(p.x, p.y, 40)).toEqual(h);
    }
  });

  it('hexEdge returns two distinct endpoints and hexEdgeNeighbor gives a distinct tile', () => {
    const h = { q: 0, r: 0 };
    for (let e = 0; e < 6; e++) {
      const seg = hexEdge(h, e, 40);
      const samePoint = seg.ax === seg.bx && seg.ay === seg.by;
      expect(samePoint).toBe(false);
      const n = hexEdgeNeighbor(h, e);
      expect(n.q !== 0 || n.r !== 0).toBe(true);
    }
  });

  it('hexEdgeNeighbor maps each edge to the tile across that edge', () => {
    const h = { q: 0, r: 0 };
    const expected = [
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
      { q: -1, r: 0 },
      { q: 0, r: -1 },
      { q: 1, r: -1 },
    ];
    for (let e = 0; e < 6; e++) {
      expect(hexEdgeNeighbor(h, e)).toEqual(expected[e]);
    }
  });

  it('hexCorners returns six corners centered on the tile', () => {
    const corners = hexCorners({ q: 0, r: 0 }, 40);
    expect(corners.length).toBe(6);
    const expectedHypot = Math.hypot(40 * Math.cos(-Math.PI / 6), 40 * Math.sin(-Math.PI / 6) * HEX_TILT);
    expect(Math.hypot(corners[0]!.x, corners[0]!.y)).toBeCloseTo(expectedHypot);
    expect(corners.reduce((sum, c) => sum + c.x, 0)).toBeCloseTo(0);
    expect(corners.reduce((sum, c) => sum + c.y, 0)).toBeCloseTo(0);
  });

  it('compareTileY sorts tiles by screen y ascending', () => {
    const tiles = [
      { q: 1, r: 0 },
      { q: 0, r: 2 },
      { q: 0, r: -1 },
    ];
    const sorted = [...tiles].sort((a, b) => compareTileY(a, b, 40));
    expect(sorted.map((t) => t.r)).toEqual([-1, 0, 2]);
  });

  it('compareTileY returns 0 for the same tile', () => {
    expect(compareTileY({ q: 0, r: 0 }, { q: 0, r: 0 }, 40)).toBe(0);
  });

  it('hexToPixel squashes y by HEX_TILT', () => {
    expect(hexToPixel({ q: 0, r: 1 }, 40).y).toBeCloseTo(1.5 * 40 * HEX_TILT);
    expect(hexToPixel({ q: 0, r: 1 }, 40).x).toBeCloseTo(Math.sqrt(3) / 2 * 40);
  });

  it('splitHexBorder splits near the top of the hex on both edges and keeps the border continuous', () => {
    const corners = hexCorners({ q: 0, r: 0 }, 40);
    const blend = (a: { x: number; y: number }, b: { x: number; y: number }, t: number): { x: number; y: number } => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
    const rightMid = blend(corners[0]!, corners[1]!, 0.1);
    const leftMid = blend(corners[3]!, corners[4]!, 0.9);
    const { top, bottom } = splitHexBorder(corners);
    expect(top).toEqual([rightMid, corners[0], corners[5], corners[4], leftMid]);
    expect(bottom).toEqual([rightMid, corners[1], corners[2], corners[3], leftMid]);
    expect(top[0]).toEqual(bottom[0]);
    expect(top[top.length - 1]).toEqual(bottom[bottom.length - 1]);
  });
});
