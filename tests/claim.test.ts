import { describe, it, expect } from 'vitest';
import { MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { claimTileForVillage } from '../src/game/claim';

function tile(q: number, r: number, ownedBy: number | null, claimedByVillage: { q: number; r: number } | null): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy, claimedByVillage, building: null };
}

describe('claimTileForVillage', () => {
  it('claims an unclaimed tile', () => {
    const target = tile(1, 0, null, null);
    const village = tile(0, 0, 0, { q: 0, r: 0 });
    village.settlement = { owner: 0, level: 1, captureReady: false };
    claimTileForVillage(target, village);
    expect(target.ownedBy).toBe(0);
    expect(target.claimedByVillage).toEqual({ q: 0, r: 0 });
  });

  it('steals a free village cell (not the free village itself)', () => {
    const freeCell = tile(1, 0, null, { q: 2, r: 0 });
    const village = tile(0, 0, 0, { q: 0, r: 0 });
    village.settlement = { owner: 0, level: 1, captureReady: false };
    claimTileForVillage(freeCell, village);
    expect(freeCell.ownedBy).toBe(0);
    expect(freeCell.claimedByVillage).toEqual({ q: 0, r: 0 });
  });

  it('does not steal the free village own tile', () => {
    const freeVillageTile = tile(2, 0, null, { q: 2, r: 0 });
    const village = tile(0, 0, 0, { q: 0, r: 0 });
    village.settlement = { owner: 0, level: 1, captureReady: false };
    claimTileForVillage(freeVillageTile, village);
    expect(freeVillageTile.ownedBy).toBeNull();
    expect(freeVillageTile.claimedByVillage).toEqual({ q: 2, r: 0 });
  });

  it('does not steal another players territory', () => {
    const other = tile(1, 0, 3, { q: 9, r: 9 });
    const village = tile(0, 0, 0, { q: 0, r: 0 });
    village.settlement = { owner: 0, level: 1, captureReady: false };
    claimTileForVillage(other, village);
    expect(other.ownedBy).toBe(3);
    expect(other.claimedByVillage).toEqual({ q: 9, r: 9 });
  });
});
