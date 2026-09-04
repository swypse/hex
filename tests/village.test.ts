import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { claimRadius, ownedTilesFor, upgradeVillage } from '../src/game/village';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit: null, ownedBy, claimedByVillage: null, building: null };
}

function makeMap(): GameMap {
  const a = makeTile(0, 0, 0, { owner: 0, level: 1, captureReady: false });
  const b = makeTile(3, 0, 1, { owner: 1, level: 1, captureReady: false });
  const free = makeTile(0, 3, null, { owner: null, level: 1, captureReady: false });
  const empty = makeTile(2, 0, null);
  const tiles = [a, b, free, empty];
  return { radius: 5, tiles, spawns: [] };
}

describe('claimRadius', () => {
  it('maps level to radius', () => {
    expect(claimRadius(1)).toBe(1);
    expect(claimRadius(2)).toBe(2);
    expect(claimRadius(5)).toBe(2);
  });
});

describe('ownedTilesFor', () => {
  it('returns all tiles owned by the same player', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    expect(ownedTilesFor(map, a)).toHaveLength(1);
    expect(ownedTilesFor(map, a)[0]!.q).toBe(0);
  });
});

describe('upgradeVillage', () => {
  it('increments level and claims unowned tiles within radius 2', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    upgradeVillage(map, a);
    expect(a.settlement!.level).toBe(2);
    const owned = map.tiles.filter((t) => t.ownedBy === 0);
    expect(owned).toContain(a);
    expect(owned.some((t) => t.q === 2 && t.r === 0)).toBe(true);
    expect(map.tiles.find((t) => t.q === 3 && t.r === 0)!.ownedBy).toBe(1);
  });

  it('does nothing for a neutral village', () => {
    const map = makeMap();
    const free = map.tiles[2]!;
    upgradeVillage(map, free);
    expect(free.settlement!.level).toBe(1);
  });
});
