import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { TILE_MOVE_COST, tileMoveCost, waterRouteKeys } from '../src/game/movementCost';

function mk(q: number, r: number, terrain: TileType, opts: Partial<MapTile> = {}): MapTile {
  return {
    q, r, terrain, settlement: null, building: null, unit: null,
    ownedBy: null, claimedByVillage: null, exploredBy: [],
    ...opts,
  };
}

function map(tiles: MapTile[]): GameMap {
  return { radius: 8, tiles, spawns: [] };
}

describe('TILE_MOVE_COST', () => {
  it('defines base costs', () => {
    expect(TILE_MOVE_COST).toEqual({ land: 10, water: 10, forest: 14, mountain: 20 });
  });
});

describe('tileMoveCost', () => {
  it('charges the base terrain cost to leave a tile', () => {
    const m = (t: MapTile) => map([t]);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandLand)), mk(0, 0, TileType.GrasslandLand), 0)).toBe(10);
    expect(tileMoveCost(m(mk(0, 0, TileType.Water)), mk(0, 0, TileType.Water), 0)).toBe(10);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandForest)), mk(0, 0, TileType.GrasslandForest), 0)).toBe(14);
    expect(tileMoveCost(m(mk(0, 0, TileType.GrasslandMountain)), mk(0, 0, TileType.GrasslandMountain), 0)).toBe(20);
  });

  it('halves the cost on the units own road only', () => {
    const road = mk(0, 0, TileType.GrasslandLand, { roadOwner: 0 });
    const foreign = mk(0, 0, TileType.GrasslandLand, { roadOwner: 1 });
    expect(tileMoveCost(map([road]), road, 0)).toBe(5);
    expect(tileMoveCost(map([road]), road, 1)).toBe(10);
    expect(tileMoveCost(map([foreign]), foreign, 0)).toBe(10);
  });

  it('halves forest and mountain roads with floor', () => {
    const f = mk(0, 0, TileType.GrasslandForest, { roadOwner: 0 });
    const mnt = mk(0, 0, TileType.GrasslandMountain, { roadOwner: 0 });
    expect(tileMoveCost(map([f]), f, 0)).toBe(7);
    expect(tileMoveCost(map([mnt]), mnt, 0)).toBe(10);
  });

  it('treats a bridge as an own road on water', () => {
    const b = mk(0, 0, TileType.Water, { bridge: { owner: 0, dir: 'we' }, roadOwner: 0 });
    expect(tileMoveCost(map([b]), b, 0)).toBe(5);
    expect(tileMoveCost(map([b]), b, 1)).toBe(10);
  });

  it('halves water-route tiles between own ports', () => {
    const portA = mk(0, 0, TileType.Water, { building: { kind: 'port', level: 1 }, ownedBy: 0 });
    const mid = mk(1, 0, TileType.Water, { ownedBy: 0 });
    const portB = mk(2, 0, TileType.Water, { building: { kind: 'port', level: 1 }, ownedBy: 0 });
    const m = map([portA, mid, portB]);
    const keys = waterRouteKeys(m);
    expect(keys).toContain('1,0');
    expect(tileMoveCost(m, mid, 0, keys)).toBe(5);
    expect(tileMoveCost(m, mid, 1, keys)).toBe(10);
    // Without the water-route key the full water cost applies.
    expect(tileMoveCost(m, mid, 0)).toBe(10);
  });

  it('halves an own village connected to an own road', () => {
    const village = mk(0, 0, TileType.GrasslandLand, {
      settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0,
    });
    const road = mk(1, 0, TileType.GrasslandLand, { roadOwner: 0, ownedBy: 0 });
    const disconnected = map([village]);
    const connected = map([village, road]);
    expect(tileMoveCost(connected, village, 0)).toBe(5);
    expect(tileMoveCost(disconnected, village, 0)).toBe(10);
    expect(tileMoveCost(connected, village, 1)).toBe(10);
  });

  it('does not halve an own village with only a foreign road next to it', () => {
    const village = mk(0, 0, TileType.GrasslandLand, {
      settlement: { owner: 0, level: 1, captureReady: false }, ownedBy: 0,
    });
    const road = mk(1, 0, TileType.GrasslandLand, { roadOwner: 1, ownedBy: 1 });
    expect(tileMoveCost(map([village, road]), village, 0)).toBe(10);
  });
});