import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit, giveResources } from './helpers/test-map';
import { type GameMap } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { BRIDGE_COST, bridgeDirFor, buildBridge, canBuildBridge } from '../src/game/economy/bridges';
import { canBuildPort, canBuildTemple } from '../src/game/economy/buildings';
import { BridgeDir, BuildingKind, SkillId, UnitType } from '@enums';

function player(skills: Player['skills'] = [], money = 100): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 100, stone: 100, money, ore: 0, food: 20 },
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
    expect(bridgeDirFor(weGap(), tileAt(weGap(), 1, 0)!)).toBe(BridgeDir.WE);
  });

  it('detects the ne diagonal axis', () => {
    expect(bridgeDirFor(neGap(), tileAt(neGap(), 1, 0)!)).toBe(BridgeDir.NE);
  });

  it('detects the nw diagonal axis', () => {
    expect(bridgeDirFor(nwGap(), tileAt(nwGap(), 1, 0)!)).toBe(BridgeDir.NW);
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
    expect(canBuildBridge(map, water, player([SkillId.BRIDGES]))).toBe(true);

    water.unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    expect(canBuildBridge(map, water, player([SkillId.BRIDGES]))).toBe(false);
    water.unit = null;

    water.building = { kind: BuildingKind.PORT, level: 1 };
    expect(canBuildBridge(map, water, player([SkillId.BRIDGES]))).toBe(false);
    water.building = null;

    water.bridge = { owner: 0, dir: BridgeDir.WE };
    expect(canBuildBridge(map, water, player([SkillId.BRIDGES]))).toBe(false);
    water.bridge = null;
  });
});

describe('buildBridge', () => {
  it('pays the cost and stamps the bridge plus road owner', () => {
    const map = weGap();
    const p = player([SkillId.BRIDGES]);
    const village = giveResources(map, p, { wood: 100, stone: 100 })!;
    const before = { money: p.resources.money, ...village.settlement!.stock! };
    expect(buildBridge(map, tileAt(map, 1, 0)!, p)).toBe(true);
    expect(tileAt(map, 1, 0)!.bridge).toEqual({ owner: 0, dir: BridgeDir.WE });
    expect(tileAt(map, 1, 0)!.roadOwner).toBe(0);
    expect(village.settlement!.stock!.wood).toBe(before.wood - BRIDGE_COST.wood);
    expect(p.resources.money).toBe(before.money - BRIDGE_COST.money);
    expect(village.settlement!.stock!.stone).toBe(before.stone - BRIDGE_COST.stone);
  });

  it('fails without the skill, with too little money, or on a land tile', () => {
    const map = weGap();
    expect(buildBridge(map, tileAt(map, 1, 0)!, player([]))).toBe(false);
    expect(buildBridge(map, tileAt(map, 1, 0)!, player([SkillId.BRIDGES], 5))).toBe(false);
    expect(buildBridge(map, tileAt(map, 0, 0)!, player([SkillId.BRIDGES]))).toBe(false);
  });
});

describe('port and water temple exclusion', () => {
  function waterTileMap(bridged: boolean): GameMap {
    const map = weGap();
    const water = tileAt(map, 1, 0)!;
    water.ownedBy = 0;
    // The west shore is owned land, so the (non-bridged) water tile is a legal port.
    tileAt(map, 0, 0)!.ownedBy = 0;
    if (bridged) water.bridge = { owner: 0, dir: BridgeDir.WE };
    return map;
  }

  it('a port cannot be built on a bridged water tile', () => {
    const open = canBuildPort(waterTileMap(false), tileAt(waterTileMap(false), 1, 0)!, player([SkillId.WATER, SkillId.BRIDGES]));
    const blocked = canBuildPort(waterTileMap(true), tileAt(waterTileMap(true), 1, 0)!, player([SkillId.WATER, SkillId.BRIDGES]));
    expect(open).toBe(true);
    expect(blocked).toBe(false);
  });

  it('a water temple cannot be built on a bridged water tile', () => {
    const open = canBuildTemple(waterTileMap(false), tileAt(waterTileMap(false), 1, 0)!, player([SkillId.WATER_TEMPLES, SkillId.BRIDGES]));
    const blocked = canBuildTemple(waterTileMap(true), tileAt(waterTileMap(true), 1, 0)!, player([SkillId.WATER_TEMPLES, SkillId.BRIDGES]));
    expect(open).toBe(true);
    expect(blocked).toBe(false);
  });
});
