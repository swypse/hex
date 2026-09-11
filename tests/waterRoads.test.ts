import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { portWaterClusterJumps, waterRouteEdges } from '../src/game/waterRoads';

function tile(q: number, r: number, terrain: TileType, ownedBy: number | null = null, opts: { port?: boolean; bridge?: boolean } = {}): MapTile {
  const t: MapTile = {
    q, r, terrain,
    settlement: null,
    building: opts.port ? { kind: 'port', level: 1 } : null,
    unit: null,
    ownedBy,
    claimedByVillage: null,
    roadOwner: null,
  };
  if (opts.bridge) {
    t.bridge = { owner: ownedBy ?? 0, dir: 'we' };
    t.roadOwner = ownedBy ?? 0;
  }
  return t;
}

function mapOf(tiles: MapTile[]): GameMap {
  return { radius: 4, spawns: [], tiles };
}

describe('portWaterClusterJumps', () => {
  it('returns no jumps for a single own port', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
    ]);
    expect(portWaterClusterJumps(map)).toEqual(new Map());
  });

  it('connects two ports in the same own-water component', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
      tile(2, 0, TileType.Water, 0, { port: true }),
    ]);
    const jumps = portWaterClusterJumps(map);
    expect(jumps.get('0,0')?.has('2,0')).toBe(true);
    expect(jumps.get('2,0')?.has('0,0')).toBe(true);
  });

  it('does not connect ports separated by unowned water', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, null),
      tile(2, 0, TileType.Water, 0, { port: true }),
    ]);
    expect(portWaterClusterJumps(map)).toEqual(new Map());
  });

  it('does not connect ports in separate water components', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
      tile(2, 0, TileType.Water, null),
      tile(3, 0, TileType.Water, 0),
      tile(4, 0, TileType.Water, 0, { port: true }),
    ]);
    expect(portWaterClusterJumps(map)).toEqual(new Map());
  });

  it('connects several ports across one own-water region', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
      tile(2, 0, TileType.Water, 0, { port: true }),
      tile(2, -1, TileType.Water, 0),
      tile(3, -1, TileType.Water, 0, { port: true }),
    ]);
    const jumps = portWaterClusterJumps(map);
    expect(jumps.get('0,0')?.has('2,0')).toBe(true);
    expect(jumps.get('2,0')?.has('3,-1')).toBe(true);
    expect(jumps.get('3,-1')?.has('0,0')).toBe(true);
  });

  it('routes run through an owned bridge tile', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0, { bridge: true }),
      tile(2, 0, TileType.Water, 0, { port: true }),
    ]);
    const jumps = portWaterClusterJumps(map);
    expect(jumps.get('0,0')?.has('2,0')).toBe(true);
  });
});

describe('waterRouteEdges', () => {
  it('marks the shortest-path edges between two connected ports', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
      tile(2, 0, TileType.Water, 0, { port: true }),
    ]);
    const edges = waterRouteEdges(map);
    expect(edges.get('0,0')).toEqual(['1,0']);
    expect(edges.get('1,0')).toEqual(['0,0', '2,0']);
    expect(edges.get('2,0')).toEqual(['1,0']);
  });

  it('produces no edges for ports with no own-water connection', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, null),
      tile(2, 0, TileType.Water, 0, { port: true }),
    ]);
    expect(waterRouteEdges(map)).toEqual(new Map());
  });

  it('links several ports into a single connected chain', () => {
    const map = mapOf([
      tile(0, 0, TileType.Water, 0, { port: true }),
      tile(1, 0, TileType.Water, 0),
      tile(2, 0, TileType.Water, 0, { port: true }),
      tile(3, 0, TileType.Water, 0),
      tile(4, 0, TileType.Water, 0, { port: true }),
    ]);
    const edges = waterRouteEdges(map);
    // Every port and intermediate tile must be on the chain, and its edge
    // count must be exactly n-1 (a tree over 5 tiles).
    const allKeys = ['0,0', '1,0', '2,0', '3,0', '4,0'];
    for (const k of allKeys) {
      expect(edges.get(k)?.length ?? 0).toBeGreaterThan(0);
    }
    const totalEdges = allKeys.reduce((sum, k) => sum + (edges.get(k)?.length ?? 0), 0) / 2;
    expect(totalEdges).toBe(allKeys.length - 1);
  });

  it('connects player 1 ports over their own water', () => {
    const p1 = mapOf([
      tile(0, 0, TileType.Water, 1, { port: true }),
      tile(1, 0, TileType.Water, 1),
      tile(2, 0, TileType.Water, 1, { port: true }),
    ]);
    const jumps = portWaterClusterJumps(p1);
    expect(jumps.get('0,0')?.has('2,0')).toBe(true);
  });
});