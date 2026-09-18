import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/map-gen';
import {
  contentLayers,
  cycleSelection,
  moveUnit,
  pathBetween,
  reachableTargets,
  tileAt,
} from '../src/game/selection';
import { TileType } from '../src/game/tile-types';
import { Unit } from '../src/game/units';

function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement, unit, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] };
}

function makeMap(): GameMap {
  const warrior: Unit = {
    id: 'w0',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
  };
  const other: Unit = {
    id: 'w1',
    owner: 1,
    type: 'warrior',
    q: -1,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
  };
  const tiles: MapTile[] = [
    makeTile(0, 0, TileType.GrasslandLand, null, warrior),
    makeTile(1, 0, TileType.Water),
    makeTile(0, 1, TileType.GrasslandLand),
    makeTile(1, -1, TileType.GrasslandLand, { owner: null, level: 1, captureReady: false }),
    makeTile(-1, 0, TileType.GrasslandLand, null, other),
  ];
  return { radius: 4, tiles, spawns: [] };
}

describe('tileAt', () => {
  it('returns the tile or undefined', () => {
    const map = makeMap();
    expect(tileAt(map, 0, 0)?.q).toBe(0);
    expect(tileAt(map, 5, 5)).toBeUndefined();
  });
});

describe('contentLayers', () => {
  it('lists present layers highest priority first', () => {
    const map = makeMap();
    expect(contentLayers(map.tiles[0]!)).toEqual(['unit', 'terrain']);
    expect(contentLayers(map.tiles[1]!)).toEqual(['terrain']);
    expect(contentLayers(map.tiles[3]!)).toEqual(['village', 'terrain']);
  });
});

describe('cycleSelection', () => {
  it('selects highest priority on a fresh tile', () => {
    const map = makeMap();
    expect(cycleSelection(null, map.tiles[0]!).kind).toBe('unit');
    expect(cycleSelection(null, map.tiles[3]!).kind).toBe('village');
  });

  it('cycles down on repeated clicks of the same tile', () => {
    const map = makeMap();
    const first = cycleSelection(null, map.tiles[0]!);
    expect(first.kind).toBe('unit');
    const second = cycleSelection(first, map.tiles[0]!);
    expect(second.kind).toBe('terrain');
    const third = cycleSelection(second, map.tiles[0]!);
    expect(third.kind).toBe('unit');
  });

  it('resets to highest priority when clicking a different tile', () => {
    const map = makeMap();
    const selectedTerrain = { kind: 'terrain' as const, q: 0, r: 0 };
    const next = cycleSelection(selectedTerrain, map.tiles[3]!);
    expect(next.kind).toBe('village');
  });
});

// NOTE: the file's existing `makeTile`/`makeMap` helpers (defined before the
// `tileAt` describe) stay where they are and are reused below. Only add these
// new helpers:
function mkUnit(owner: number, type: string, q: number, r: number, shipLevel?: 1 | 2 | 3): Unit {
  return {
    id: 'u',
    owner,
    type,
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
    shipLevel,
  } as Unit;
}

const L = (q: number, r: number, opts: Partial<MapTile> = {}): MapTile =>
  ({ q, r, terrain: TileType.GrasslandLand, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0], ...opts });
const F = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.GrasslandForest });
const M = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.GrasslandMountain });
const W = (q: number, r: number): MapTile => ({ ...L(q, r), terrain: TileType.Water });

function lineMap(start: MapTile, ...tiles: MapTile[]): GameMap {
  return { radius: 8, tiles: [start, ...tiles], spawns: [] };
}

describe('reachableTargets', () => {
  it('excludes water, occupied tiles, and self; includes empty land and empty villages', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const targets = reachableTargets(map, unit);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('0,1');
    expect(keys).toContain('1,-1');
    expect(keys).not.toContain('1,0');
    expect(keys).not.toContain('-1,0');
    expect(keys).not.toContain('0,0');
  });

  it('excludes unexplored tiles', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    map.tiles.forEach((t) => { if (t.q !== 0 || t.r !== 0) t.exploredBy = []; });
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('0,1');
  });

  it('reaches tiles whose total leaving cost fits the move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, L(1, 0), L(2, 0), L(3, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    expect(keys(20)).toContain('2,0'); // leave land(10) + land(10)
    expect(keys(20)).not.toContain('3,0');
    expect(keys(30)).toContain('3,0');
  });

  it('a forest tile costs 14 to leave', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, F(1, 0), L(2, 0), L(3, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    // 10 (leave land) + 14 (leave forest) = 24 needed for (2,0).
    expect(keys(20)).not.toContain('2,0');
    expect(keys(24)).toContain('2,0');
    // And (3,0) needs another 10: 34.
    expect(keys(30)).not.toContain('3,0');
    expect(keys(34)).toContain('3,0');
  });

  it('a mountain tile costs 20 to leave', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, M(1, 0), L(2, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts, true).map((t) => `${t.q},${t.r}`);
    expect(keys(30)).toContain('2,0'); // 10 + 20
    expect(keys(29)).not.toContain('2,0');
  });

  it('halves the cost on the unit own road, not on a foreign road', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const ownRoad = L(0, 0, { unit, roadOwner: 0 });
    const enemyRoad = L(0, 0, { unit, roadOwner: 1 });
    // Own road: leaving it costs 5, so (2,0) needs 15.
    const ownMap = lineMap(ownRoad, L(1, 0), L(2, 0));
    const enMap = lineMap(enemyRoad, L(1, 0), L(2, 0));
    expect(reachableTargets(ownMap, unit, 15).map((t) => `${t.q},${t.r}`)).toContain('2,0');
    expect(reachableTargets(enMap, unit, 15).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
  });

  it('always allows an adjacent tile even without enough move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, F(1, 0), L(2, 0));
    const keys = (pts: number) => reachableTargets(map, unit, pts).map((t) => `${t.q},${t.r}`);
    expect(keys(1)).toContain('1,0'); // direct neighbour: always reachable
    expect(keys(1)).not.toContain('2,0');
  });

  it('mountains block movement unless climbing is opened', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start = L(0, 0, { unit });
    const map = lineMap(start, M(1, 0), L(2, 0));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('1,0');
    expect(reachableTargets(map, unit, undefined, true).map((t) => `${t.q},${t.r}`)).toContain('1,0');
  });

  it('ships move on water and land only on coast tiles', () => {
    const unit = mkUnit(0, 'warrior', 0, 0, 1);
    const start = W(0, 0);
    start.unit = unit;
    const map: GameMap = { radius: 8, tiles: [start, L(1, 0), L(2, 0)], spawns: [] };
    const keys = reachableTargets(map, unit, 20).map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('1,0'); // coast landing
    expect(keys).not.toContain('2,0'); // inland: ships never pass through land
  });

  it('halves water-route travel for the owner', () => {
    const unit = mkUnit(0, 'warrior', 0, 0, 1);
    const portA = W(0, 0);
    portA.unit = unit;
    portA.building = { kind: 'port', level: 1 };
    portA.ownedBy = 0;
    const mid = W(1, 0);
    mid.ownedBy = 0;
    const portB = W(2, 0);
    portB.building = { kind: 'port', level: 1 };
    portB.ownedBy = 0;
    const routeMap: GameMap = { radius: 8, tiles: [portA, mid, portB], spawns: [] };
    // Route present: leaving the port (5) + leaving the water-road (5) = 10.
    expect(reachableTargets(routeMap, unit, 10).map((t) => `${t.q},${t.r}`)).toContain('2,0');
    // No route (a single port): both hops cost 10 each, so 20 is needed for
    // the far water tile.
    const noRouteMid = W(1, 0);
    noRouteMid.ownedBy = 0;
    const far = W(2, 0);
    far.ownedBy = 0;
    const lone: GameMap = { radius: 8, tiles: [portA, noRouteMid, far], spawns: [] };
    expect(reachableTargets(lone, unit, 10).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
  });

  it('a non-ship can step onto its own port water tile only with navigation', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const map = makeMap();
    const port = makeTile(1, 0, TileType.Water);
    port.building = { kind: 'port', level: 1 };
    port.ownedBy = 0;
    map.tiles = [map.tiles[0]!, port];
    expect(reachableTargets(map, unit).some((t) => t.q === 1 && t.r === 0)).toBe(false);
    expect(reachableTargets(map, unit, undefined, false, true).some((t) => t.q === 1 && t.r === 0)).toBe(true);
  });

  it('stops movement at the first cell adjacent to an enemy', () => {
    const unit = mkUnit(0, 'rider', 0, 0);
    const enemy = mkUnit(1, 'warrior', 2, 1);
    const map: GameMap = { radius: 8, tiles: [L(0, 0, { unit }), L(1, 0), L(2, 0), L(3, 0), L(2, 1, { unit: enemy })], spawns: [] };
    const keys = reachableTargets(map, unit, 40).map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('2,0');
    expect(keys).not.toContain('3,0');
  });
});

describe('pathBetween', () => {
  it('walks around water cell by cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), W(1, 0), L(2, 0), L(0, 1), L(1, 1));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 0 },
    ]);
  });

  it('returns an empty array when the target is unreachable', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([]);
  });

  it('cannot pass through unexplored tiles', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), L(1, 0), L(2, 0));
    map.tiles[1]!.exploredBy = [];
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
  });

  it('returns an empty array when start equals target', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 0 })).toEqual([]);
  });

  it('mountains block movement unless climbing is opened', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(L(0, 0), M(1, 0), L(2, 0));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, true)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('ships can move on water', () => {
    const map: GameMap = { radius: 4, tiles: [W(0, 0), W(1, 0)], spawns: [] };
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true)).toEqual([{ q: 1, r: 0 }]);
  });

  it('a ship lands only on coast tiles', () => {
    const map: GameMap = { radius: 8, tiles: [W(0, 0), L(1, 0), L(2, 0)], spawns: [] };
    // Landing on the coast within points.
    const landing = pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true, false, 0, 20);
    expect(landing).toEqual([{ q: 1, r: 0 }]);
    // No route to inland tiles.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, true)).toEqual([]);
  });

  it('returns an empty array when the shortest path overspends the move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const map: GameMap = { radius: 8, tiles: [L(0, 0, { unit }), M(1, 0), M(2, 0), L(3, 0)], spawns: [] };
    // Walking onto (3,0) over both mountains costs 10 + 20 + 20 = 50.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, true, false, false, 0, 40)).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, true, false, false, 0, 50)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ]);
  });

  it('picks a cost-feasible detour when the shortest path overspends', () => {
    const unit = mkUnit(0, 'rider', 0, 0);
    const start = L(0, 0, { unit });
    const map: GameMap = {
      radius: 8,
      tiles: [
        start,
        M(1, 0), M(2, 0), M(3, 0),
        L(4, 0),
        L(0, 1), L(1, 1), L(2, 1), L(3, 1), L(4, 1),
      ],
      spawns: [],
    };
    // Direct route costs 10 + 20 + 20 + 20 = 70; the flat detour below costs
    // 5 land steps = 50. With 65 points only the detour fits.
    const path = pathBetween(map, { q: 0, r: 0 }, { q: 4, r: 0 }, true, false, false, 0, 65);
    expect(path).toEqual([
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 3, r: 1 },
      { q: 4, r: 0 },
    ]);
    expect(reachableTargets(map, unit, 65, true).map((t) => `${t.q},${t.r}`)).toContain('4,0');
    // With 70 points the direct mountain route fits and wins on steps.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 4, r: 0 }, true, false, false, 0, 70)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 4, r: 0 },
    ]);
  });

  it('walks a direct neighbour even when the first step costs more than the move points', () => {
    const unit = mkUnit(0, 'warrior', 0, 0);
    const start: MapTile = { ...L(0, 0), terrain: TileType.GrasslandForest, unit };
    const map: GameMap = { radius: 8, tiles: [start, L(1, 0)], spawns: [] };
    // Leaving the forest costs 14 > the warrior's 10 points, yet the adjacent
    // tile is always reachable (always-move-one), so its walk must exist —
    // otherwise a legal move would skip the fog exploration entirely.
    const reached = reachableTargets(map, unit, 10).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, false, false, 0, 10)).toEqual([{ q: 1, r: 0 }]);
    // A tile beyond the direct neighbour still needs the full budget.
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, false, false, 0, 10)).toEqual([]);
  });

  it('stops movement at the first cell adjacent to an enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = mkUnit(1, 'warrior', 2, 1);
    map.tiles.push(L(0, 0), L(1, 0), L(2, 0), L(3, 0), L(2, 1, { unit: enemy }));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, false, false, false, 0)).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, false, false, 0)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('a unit adjacent to an enemy can still move at least one cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = mkUnit(1, 'warrior', 1, 0);
    map.tiles.push(L(0, 0), L(1, 0, { unit: enemy }), L(0, 1));
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 1 }, false, false, false, 0)).toEqual([{ q: 0, r: 1 }]);
  });
});

describe('moveUnit', () => {
  it('moves the unit, clears the source, and marks hasMoved', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const target = tileAt(map, 0, 1)!;
    moveUnit(map, unit, target);
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect(tileAt(map, 0, 1)!.unit).toBe(unit);
    expect(unit.q).toBe(0);
    expect(unit.r).toBe(1);
    expect(unit.hasMoved).toBe(true);
  });
});

describe('bridged water movement', () => {
  function bridgeGap(): GameMap {
    const map = makeMap();
    tileAt(map, 1, 0)!.bridge = { owner: 0, dir: 'we' };
    return map;
  }

  it('a land unit can step onto a bridged water tile', () => {
    const map = bridgeGap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const reached = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([{ q: 1, r: 0 }]);
  });

  it('a land unit can cross a bridged water tile to the far shore', () => {
    const map = makeMap();
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    tileAt(map, 1, 0)!.bridge = { owner: 0, dir: 'we' };
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('a land unit cannot cross an unbridged water tile', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    const reached = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(reached).not.toContain('1,0');
  });

  it('a ship can still sail through a bridged water tile', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const ship: Unit = {
      id: 'sh', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null, shipLevel: 1,
    };
    map.tiles.push(makeTile(0, 0, TileType.Water, null, ship));
    const middle = makeTile(1, 0, TileType.Water);
    middle.bridge = { owner: 0, dir: 'we' };
    map.tiles.push(middle);
    map.tiles.push(makeTile(2, 0, TileType.Water));
    const reached = reachableTargets(map, ship, 30).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('2,0');
  });
});
