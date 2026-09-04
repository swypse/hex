import { describe, it, expect } from 'vitest';
import { hexDistance } from '../src/game/hex';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import {
  contentLayers,
  cycleSelection,
  moveUnit,
  pathBetween,
  reachableTargets,
  tileAt,
} from '../src/game/selection';
import { TileType } from '../src/game/tileTypes';
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

  it('respects movement distance', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    for (const t of reachableTargets(map, unit)) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(1);
    }
  });

  it('respects a custom range', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    for (const t of reachableTargets(map, unit, 2)) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(2);
    }
  });

  it('excludes unexplored tiles', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    map.tiles.forEach((t) => { if (t.q !== 0 || t.r !== 0) t.exploredBy = []; });
    const keys = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(keys).not.toContain('0,1');
  });

  it('reaches one hex further when the unit starts on its own road', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const start = makeTile(0, 0, TileType.GrasslandLand);
    start.unit = unit;
    start.roadOwner = 0;
    const map: GameMap = { radius: 4, tiles: [start], spawns: [] };
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).toContain('2,0');
  });

  it('gives no road bonus on an enemy road', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const start = makeTile(0, 0, TileType.GrasslandLand);
    start.unit = unit;
    start.roadOwner = 1;
    const map: GameMap = { radius: 4, tiles: [start], spawns: [] };
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
  });
});

describe('pathBetween', () => {
  it('walks around water cell by cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.Water));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(0, 1, TileType.GrasslandLand));
    map.tiles.push(makeTile(1, 1, TileType.GrasslandLand));
    const path = pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 });
    expect(path).toEqual([{ q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 0 }]);
  });

  it('returns an empty array when the target is unreachable', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([]);
  });

  it('cannot pass through unexplored tiles', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    map.tiles[1]!.exploredBy = [];
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
  });

  it('returns an empty array when start equals target', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 0 })).toEqual([]);
  });

  it('mountains block movement unless climbing is opened', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandMountain));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 })).toEqual([]);
    expect(reachableTargets(map, unit, undefined, true).map((t) => `${t.q},${t.r}`)).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, true)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('only reaches tiles whose actual path fits the move distance', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.Water));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(0, 1, TileType.GrasslandLand));
    map.tiles.push(makeTile(1, 1, TileType.GrasslandLand));
    const reached = reachableTargets(map, unit, 2).map((t) => `${t.q},${t.r}`);
    expect(reached).not.toContain('2,0');
    expect(reached).toContain('0,1');
    expect(reached).toContain('1,1');
    expect(reachableTargets(map, unit, 3).map((t) => `${t.q},${t.r}`)).toContain('2,0');
  });

  it('ships can move on water', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
      shipLevel: 1,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.Water));
    const reached = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('1,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 }, false, true)).toEqual([{ q: 1, r: 0 }]);
  });

  it('a ship can land only on coast tiles', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
      shipLevel: 1,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.Water, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    const reached = reachableTargets(map, unit).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('1,0');
    expect(reached).not.toContain('2,0');
  });

  it('a non-ship can step onto its own port water tile only with navigation', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const port = makeTile(1, 0, TileType.Water);
    port.building = { kind: 'port', level: 1 };
    port.ownedBy = 0;
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit), port);
    expect(reachableTargets(map, unit).some((t) => t.q === 1 && t.r === 0)).toBe(false);
    expect(reachableTargets(map, unit, undefined, false, true).some((t) => t.q === 1 && t.r === 0)).toBe(true);
  });

  it('stops movement at the first cell adjacent to an enemy', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'rider', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 4, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const enemy: Unit = {
      id: 'e', owner: 1, type: 'warrior', q: 2, r: 1,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(3, 0, TileType.GrasslandLand));
    map.tiles.push(makeTile(2, 1, TileType.GrasslandLand, null, enemy));
    const reached = reachableTargets(map, unit, 3).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('2,0');
    expect(reached).not.toContain('3,0');
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 3, r: 0 }, false, false, false, 0)).toEqual([]);
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 }, false, false, false, 0)).toEqual([
      { q: 1, r: 0 },
      { q: 2, r: 0 },
    ]);
  });

  it('a unit adjacent to an enemy can still move at least one cell', () => {
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const enemy: Unit = {
      id: 'e', owner: 1, type: 'warrior', q: 1, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.GrasslandLand, null, enemy));
    map.tiles.push(makeTile(0, 1, TileType.GrasslandLand));
    const reached = reachableTargets(map, unit, 3).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('0,1');
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
    const reached = reachableTargets(map, ship, 3).map((t) => `${t.q},${t.r}`);
    expect(reached).toContain('2,0');
  });
});
