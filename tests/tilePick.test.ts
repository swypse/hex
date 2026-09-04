import { describe, it, expect } from 'vitest';
import { pointInPolygon } from '../src/game/hex';
import { MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { pickTileAt } from '../src/render/tilePick';

function tile(q: number, r: number, height: number): MapTile {
  return {
    q,
    r,
    terrain: TileType.GrasslandLand,
    height,
    settlement: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    building: null,
  };
}

describe('pointInPolygon', () => {
  it('detects points inside and outside a polygon', () => {
    const square = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ];
    expect(pointInPolygon(0, 0, square)).toBe(true);
    expect(pointInPolygon(9, 9, square)).toBe(true);
    expect(pointInPolygon(20, 0, square)).toBe(false);
    expect(pointInPolygon(0, -20, square)).toBe(false);
  });
});

describe('pickTileAt', () => {
  const hexSize = 40;

  it('selects a flat tile when clicking its top face', () => {
    const t = tile(0, 0, 0);
    expect(pickTileAt(0, 0, hexSize, [t])).toBe(t);
    expect(pickTileAt(-20, -10, hexSize, [t])).toBe(t);
  });

  it('does not select a raised tile when clicking on its wall (below the top face)', () => {
    const t = tile(0, 0, 1);
    expect(pickTileAt(0, 0, hexSize, [t])).toBeNull();
    expect(pickTileAt(0, 20, hexSize, [t])).toBeNull();
  });

  it('selects a raised tile when clicking its elevated top face', () => {
    const t = tile(0, 0, 1);
    expect(pickTileAt(0, -40, hexSize, [t])).toBe(t);
  });

  it('returns null when the click is outside every top face', () => {
    const t = tile(0, 0, 0);
    expect(pickTileAt(200, 200, hexSize, [t])).toBeNull();
  });

  it('picks the front-most (highest row) tile when top faces overlap', () => {
    const back = tile(0, 0, 0);
    const front = tile(0, 1, 1);
    expect(pickTileAt(0, 10, hexSize, [back, front])).toBe(front);
  });
});
