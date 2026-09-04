import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import {
  exploreAround,
  exploreUnitPath,
  exploreVillageTiles,
  initialExplorationFor,
  isExploredFor,
} from '../src/game/explore';

function makeTile(q: number, r: number, ownedBy: number | null = null): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, settlement: null, building: null,
    unit: null, ownedBy, claimedByVillage: null, exploredBy: [],
  };
}

function makeMap(): GameMap {
  const tiles: MapTile[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      tiles.push(makeTile(q, r));
    }
  }
  return { radius: 2, tiles, spawns: [] };
}

function unit(attackDistance: number): Unit {
  return {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance, spawnVillage: null,
  };
}

describe('isExploredFor', () => {
  it('is false for unexplored tiles and per-player', () => {
    const tile = makeTile(0, 0);
    expect(isExploredFor(tile, 0)).toBe(false);
    tile.exploredBy!.push(1);
    expect(isExploredFor(tile, 0)).toBe(false);
    expect(isExploredFor(tile, 1)).toBe(true);
  });
});

describe('initialExplorationFor', () => {
  it('explores only tiles owned by the given player', () => {
    const map = makeMap();
    map.tiles[0]!.ownedBy = 0;
    map.tiles[1]!.ownedBy = 1;
    const newly = initialExplorationFor(map, 0);
    expect(newly).toContain(map.tiles[0]!);
    expect(newly).not.toContain(map.tiles[1]!);
    expect(isExploredFor(map.tiles[0]!, 0)).toBe(true);
    expect(isExploredFor(map.tiles[1]!, 0)).toBe(false);
  });
});

describe('exploreAround', () => {
  it('marks tiles within the radius as explored for the player', () => {
    const map = makeMap();
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    const newly = exploreAround(map, center, 1, 0);
    expect(newly.length).toBe(7);
    expect(isExploredFor(center, 0)).toBe(true);
    const far = map.tiles.find((t) => t.q === 2 && t.r === 2)!;
    expect(isExploredFor(far, 0)).toBe(false);
  });

  it('tracks exploration separately per player', () => {
    const map = makeMap();
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    exploreAround(map, center, 1, 0);
    const forOne = exploreAround(map, center, 1, 1);
    expect(forOne.length).toBe(7);
    expect(isExploredFor(center, 0)).toBe(true);
    expect(isExploredFor(center, 1)).toBe(true);
  });

  it('returns only newly explored tiles', () => {
    const map = makeMap();
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    exploreAround(map, center, 1, 0);
    const second = exploreAround(map, center, 1, 0);
    expect(second.length).toBe(0);
  });
});

describe('exploreUnitPath', () => {
  it('explores the union of radius around each visited cell', () => {
    const map = makeMap();
    const warrior = unit(1);
    const newly = exploreUnitPath(map, [{ q: 0, r: 0 }, { q: 1, r: 0 }], warrior, 0);
    expect(isExploredFor(map.tiles.find((t) => t.q === 1 && t.r === 0)!, 0)).toBe(true);
    expect(isExploredFor(map.tiles.find((t) => t.q === 2 && t.r === 0)!, 0)).toBe(true);
    expect(newly.length).toBe(new Set(newly).size);
  });

  it('uses the ship attack distance for ships', () => {
    const map = makeMap();
    const ship: Unit = { ...unit(1), shipLevel: 2 };
    exploreUnitPath(map, [{ q: 0, r: 0 }], ship, 0);
    expect(isExploredFor(map.tiles.find((t) => t.q === 2 && t.r === 0)!, 0)).toBe(true);
  });

  it('a catapult explores only within distance 1, not its attack range', () => {
    const map = makeMap();
    const catapult: Unit = { ...unit(4), type: 'catapult' };
    exploreUnitPath(map, [{ q: 0, r: 0 }], catapult, 0);
    expect(isExploredFor(map.tiles.find((t) => t.q === 1 && t.r === 0)!, 0)).toBe(true);
    expect(isExploredFor(map.tiles.find((t) => t.q === 2 && t.r === 0)!, 0)).toBe(false);
  });

  it('a ship explores by ship level, not by its original land-unit type', () => {
    // A catapult / shield on board a ship must reveal the ship's own radius
    // (level 1 => distance 2), not the land catapult's forced distance 1.
    for (const type of ['catapult', 'shield', 'archer'] as const) {
      const map = makeMap();
      const ship: Unit = { ...unit(1), type, shipLevel: 1 };
      exploreUnitPath(map, [{ q: 0, r: 0 }], ship, 0);
      expect(isExploredFor(map.tiles.find((t) => t.q === 2 && t.r === 0)!, 0), `${type} ship`).toBe(true);
      expect(isExploredFor(map.tiles.find((t) => t.q === 1 && t.r === 1)!, 0), `${type} ship`).toBe(true);
    }
  });
});

describe('exploreVillageTiles', () => {
  it('explores all tiles claimed by the village for the player', () => {
    const map = makeMap();
    const village = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
    for (const t of map.tiles) {
      if (t === village) continue;
      t.claimedByVillage = { q: 0, r: 0 };
    }
    const newly = exploreVillageTiles(map, village, 0);
    expect(newly.length).toBe(map.tiles.length - 1);
    expect(isExploredFor(village, 0)).toBe(false);
    expect(new Set(newly).size).toBe(newly.length);
  });
});
