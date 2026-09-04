import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { GameMap } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { BRIDGE_COST, bridgeDirFor, buildBridge, canBuildBridge } from '../src/game/bridges';
import { canBuildPort, canBuildTemple } from '../src/game/buildings';

function player(skills: Player['skills'] = [], money = 100): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 100, stone: 100, money, ore: 0 },
    score: 0,
    kills: 0,
    skills,
    isActive: true,
  };
}

/** Sets every one of a tile's six neighbours to water (keeps the centre as-is). */
function isolateWater(map: GameMap, q: number, r: number): void {
  const neighbours = [
    { q: q + 1, r },
    { q: q + 1, r: r - 1 },
    { q, r: r - 1 },
    { q: q - 1, r },
    { q: q - 1, r: r + 1 },
    { q, r: r + 1 },
  ];
  for (const n of neighbours) {
    const t = tileAt(map, n.q, n.r);
    if (t) t.terrain = TileType.Water;
  }
}

/** Water at (1,0) with land shores (0,0)/(2,0); every other neighbour water. */
function weGap(): GameMap {
  const map = makeTestMap();
  isolateWater(map, 1, 0);
  tileAt(map, 1, 0)!.terrain = TileType.Water;
  tileAt(map, 0, 0)!.terrain = TileType.GrasslandLand;
  tileAt(map, 2, 0)!.terrain = TileType.GrasslandLand;
  return map;
}

/** Water at (1,0) with land shores (2,-1)/(0,1); every other neighbour water. */
function neGap(): GameMap {
  const map = makeTestMap();
  isolateWater(map, 1, 0);
  tileAt(map, 1, 0)!.terrain = TileType.Water;
  tileAt(map, 2, -1)!.terrain = TileType.GrasslandLand;
  tileAt(map, 0, 1)!.terrain = TileType.GrasslandLand;
  return map;
}

/** Water at (1,0) with land shores (1,-1)/(1,1); every other neighbour water. */
function nwGap(): GameMap {
  const map = makeTestMap();
  isolateWater(map, 1, 0);
  tileAt(map, 1, 0)!.terrain = TileType.Water;
  tileAt(map, 1, -1)!.terrain = TileType.GrasslandLand;
  tileAt(map, 1, 1)!.terrain = TileType.GrasslandLand;
  return map;
}

describe('bridgeDirFor', () => {
  it('detects the horizontal we axis', () => {
    expect(bridgeDirFor(weGap(), tileAt(weGap(), 1, 0)!)).toBe('we');
  });

  it('detects the ne diagonal axis', () => {
    expect(bridgeDirFor(neGap(), tileAt(neGap(), 1, 0)!)).toBe('ne');
  });

  it('detects the nw diagonal axis', () => {
    expect(bridgeDirFor(nwGap(), tileAt(nwGap(), 1, 0)!)).toBe('nw');
  });

  it('returns null when every neighbour is water', () => {
    const map = weGap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    expect(bridgeDirFor(map, tileAt(map, 1, 0)!)).toBeNull();
  });
});

describe('canBuildBridge', () => {
  it('requires the skill, water, an empty tile, and shores', () => {
    const map = weGap();
    const water = tileAt(map, 1, 0)!;
    expect(canBuildBridge(map, water, player([]))).toBe(false);
    expect(canBuildBridge(map, water, player(['bridges']))).toBe(true);

    water.unit = makeUnit('u', 0, 'warrior', 1, 0);
    expect(canBuildBridge(map, water, player(['bridges']))).toBe(false);
    water.unit = null;

    water.building = { kind: 'port', level: 1 };
    expect(canBuildBridge(map, water, player(['bridges']))).toBe(false);
    water.building = null;

    water.bridge = { owner: 0, dir: 'we' };
    expect(canBuildBridge(map, water, player(['bridges']))).toBe(false);
    water.bridge = null;
  });
});

describe('buildBridge', () => {
  it('pays the cost and stamps the bridge plus road owner', () => {
    const map = weGap();
    const p = player(['bridges']);
    const before = { ...p.resources };
    expect(buildBridge(map, tileAt(map, 1, 0)!, p)).toBe(true);
    expect(tileAt(map, 1, 0)!.bridge).toEqual({ owner: 0, dir: 'we' });
    expect(tileAt(map, 1, 0)!.roadOwner).toBe(0);
    expect(p.resources.wood).toBe(before.wood - BRIDGE_COST.wood);
    expect(p.resources.money).toBe(before.money - BRIDGE_COST.money);
    expect(p.resources.stone).toBe(before.stone - BRIDGE_COST.stone);
  });

  it('fails without the skill, with too little money, or on a land tile', () => {
    const map = weGap();
    expect(buildBridge(map, tileAt(map, 1, 0)!, player([]))).toBe(false);
    expect(buildBridge(map, tileAt(map, 1, 0)!, player(['bridges'], 5))).toBe(false);
    expect(buildBridge(map, tileAt(map, 0, 0)!, player(['bridges']))).toBe(false);
  });
});

describe('port and water temple exclusion', () => {
  function waterTileMap(bridged: boolean): GameMap {
    const map = weGap();
    const water = tileAt(map, 1, 0)!;
    water.ownedBy = 0;
    if (bridged) water.bridge = { owner: 0, dir: 'we' };
    return map;
  }

  it('a port cannot be built on a bridged water tile', () => {
    const open = canBuildPort(waterTileMap(false), tileAt(waterTileMap(false), 1, 0)!, player(['water', 'bridges']));
    const blocked = canBuildPort(waterTileMap(true), tileAt(waterTileMap(true), 1, 0)!, player(['water', 'bridges']));
    expect(open).toBe(true);
    expect(blocked).toBe(false);
  });

  it('a water temple cannot be built on a bridged water tile', () => {
    const open = canBuildTemple(waterTileMap(false), tileAt(waterTileMap(false), 1, 0)!, player(['waterTemples', 'bridges']));
    const blocked = canBuildTemple(waterTileMap(true), tileAt(waterTileMap(true), 1, 0)!, player(['waterTemples', 'bridges']));
    expect(open).toBe(true);
    expect(blocked).toBe(false);
  });
});
