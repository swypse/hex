import { describe, it, expect } from 'vitest';
import { TileType } from '../src/game/tileTypes';
import { MapTile } from '../src/game/mapGen';
import { tileElevation } from '../src/render/elevation';

function tile(terrain: TileType, height: number): MapTile {
  return {
    q: 0,
    r: 0,
    terrain,
    height,
    settlement: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    building: null,
  };
}

describe('tileElevation', () => {
  it('renders water flat at height 0 regardless of its per-tile height', () => {
    expect(tileElevation(tile(TileType.Water, 0.5), 40)).toBe(0);
    expect(tileElevation(tile(TileType.Water, 0.1), 40)).toBe(0);
    expect(tileElevation(tile(TileType.Water, 0.9), 40)).toBe(0);
  });

  it('raises land and mountain tiles by their height in 8px steps', () => {
    expect(tileElevation(tile(TileType.GrasslandLand, 0.5), 40)).toBeCloseTo(24);
    expect(tileElevation(tile(TileType.GrasslandMountain, 0.25), 40)).toBeCloseTo(8);
  });

  it('is resolution-independent: same screen elevation at any generation hexSize', () => {
    // texture generated at hexSize=120 is scaled by 1/3 on screen; border uses hexSize=40
    for (const h of [0.2, 0.35, 0.5, 0.55, 0.75]) {
      expect(tileElevation(tile(TileType.GrasslandLand, h), 120) / 3).toBe(
        tileElevation(tile(TileType.GrasslandLand, h), 40),
      );
    }
  });

  it('treats a missing height as 0', () => {
    expect(tileElevation(tile(TileType.GrasslandLand, 0), 40)).toBe(0);
  });
});
