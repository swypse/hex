import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { SkillId } from '../src/game/skills';
import {
  buildBuilding,
  buildingIncome,
  buildingYield,
  BUILDING_NAMES,
  canBuildSawmill,
  canBuildForestTemple,
  canBuildMine,
  canBuildPort,
  canBuildTemple,
  canUsePort,
  SAWMILL_COST,
  MINE_COST,
  portDirection,
  type PortDirection,
} from '../src/game/buildings';

function tile(
  q: number,
  r: number,
  terrain: TileType,
  ownedBy: number | null,
  settlement: Settlement | null = null,
  building: MapTile['building'] = null,
): MapTile {
  return { q, r, terrain, settlement, unit: null, ownedBy, claimedByVillage: null, building };
}

function player(money: number, skills: SkillId[] = []): import('../src/game/players').Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money, ore: 0 },
    isActive: true,
    score: 0,
    kills: 0,
    skills,
  };
}

// (1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1) are the neighbors of (0,0).

describe('canBuildSawmill', () => {
  it('requires forestry, an owned land tile adjacent to a forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 1));
    expect(canBuildSawmill(map, land, player(100))).toBe(false);
    expect(canBuildSawmill(map, land, player(100, ['forestry']))).toBe(true);
  });

  it('rejects unowned, non-land, forestless, settlement, and already-built tiles', () => {
    const unowned = tile(0, 0, TileType.GrasslandLand, null);
    let map: GameMap = { radius: 2, tiles: [unowned], spawns: [] };
    expect(canBuildSawmill(map, unowned, player(100, ['forestry']))).toBe(false);

    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map = { radius: 2, tiles: [forest, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, forest, player(100, ['forestry']))).toBe(false);

    const noForest = tile(0, 0, TileType.GrasslandLand, 0);
    map = { radius: 2, tiles: [noForest], spawns: [] };
    expect(canBuildSawmill(map, noForest, player(100, ['forestry']))).toBe(false);

    const withSettlement = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level: 1, captureReady: false });
    map = { radius: 2, tiles: [withSettlement, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, withSettlement, player(100, ['forestry']))).toBe(false);

    const built = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 1 });
    map = { radius: 2, tiles: [built, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, built, player(100, ['forestry']))).toBe(false);
  });
});

describe('canBuildMine', () => {
  it('requires smithery and an owned mountain tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    expect(canBuildMine(map, mountain, player(100))).toBe(false);
    expect(canBuildMine(map, mountain, player(100, ['smithery']))).toBe(true);
    const unowned = tile(1, 0, TileType.GrasslandMountain, null);
    map.tiles.push(unowned);
    expect(canBuildMine(map, unowned, player(100, ['smithery']))).toBe(false);
    const land = tile(0, 1, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildMine(map, land, player(100, ['smithery']))).toBe(false);
  });
});

describe('canBuildPort', () => {
  it('requires water and an owned water tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    expect(canBuildPort(map, water, player(100))).toBe(false);
    expect(canBuildPort(map, water, player(100, ['water']))).toBe(true);
    const land = tile(1, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildPort(map, land, player(100, ['water']))).toBe(false);
    const unowned = tile(0, 1, TileType.Water, null);
    map.tiles.push(unowned);
    expect(canBuildPort(map, unowned, player(100, ['water']))).toBe(false);
  });
});

describe('canBuildTemple', () => {
  it('requires the waterTemples skill and an owned water tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    expect(canBuildTemple(map, water, player(100))).toBe(false);
    expect(canBuildTemple(map, water, player(100, ['waterTemples']))).toBe(true);
    const land = tile(1, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildTemple(map, land, player(100, ['waterTemples']))).toBe(false);
    const unowned = tile(0, 1, TileType.Water, null);
    map.tiles.push(unowned);
    expect(canBuildTemple(map, unowned, player(100, ['waterTemples']))).toBe(false);
  });

  it('rejects tiles with a settlement or any building (port mutual exclusion)', () => {
    const withPort = tile(0, 0, TileType.Water, 0, null, { kind: 'port', level: 1 });
    const map: GameMap = { radius: 2, tiles: [withPort], spawns: [] };
    expect(canBuildTemple(map, withPort, player(100, ['waterTemples']))).toBe(false);
    expect(canBuildPort(map, withPort, player(100, ['water']))).toBe(false);
  });
});

describe('buildBuilding', () => {
  it('builds a sawmill, deducts 10 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(20, ['forestry']);
    expect(buildBuilding(map, land, 'sawmill', p)).toBe(true);
    expect(p.resources.money).toBe(20 - SAWMILL_COST);
    expect(land.building).toEqual({ kind: 'sawmill', level: 1 });
  });

  it('builds a mine, deducts 15 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    const p = player(20, ['smithery']);
    expect(buildBuilding(map, mountain, 'mine', p)).toBe(true);
    expect(p.resources.money).toBe(20 - MINE_COST);
    expect(mountain.building).toEqual({ kind: 'mine', level: 1 });
  });

  it('builds a port, deducts 10 wood + 30 money + 2 ore, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    const p = player(100, ['water']);
    p.resources.wood = 10;
    p.resources.ore = 2;
    expect(buildBuilding(map, water, 'port', p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(p.resources.wood).toBe(0);
    expect(p.resources.ore).toBe(0);
    expect(water.building).toEqual({ kind: 'port', level: 1 });
  });

  it('builds a temple, deducts 10 stone + 30 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    const p = player(100, ['waterTemples']);
    p.resources.stone = 10;
    expect(buildBuilding(map, water, 'temple', p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(p.resources.stone).toBe(0);
    expect(water.building).toEqual({ kind: 'temple', level: 1 });
  });

  it('fails without the required skill', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(20);
    expect(buildBuilding(map, land, 'sawmill', p)).toBe(false);
    expect(land.building).toBeNull();
  });

  it('fails without enough money and does not place the building', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(SAWMILL_COST - 1, ['forestry']);
    expect(buildBuilding(map, land, 'sawmill', p)).toBe(false);
    expect(land.building).toBeNull();
  });
});

describe('buildingIncome', () => {
  it('sawmill yields level wood per adjacent forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const f1 = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 1 });
    map.tiles.push(
      f1,
      tile(1, 0, TileType.GrasslandForest, 0),
      tile(1, -1, TileType.GrasslandForest, 1),
    );
    expect(buildingIncome(map, player(0))).toEqual({ wood: 2, stone: 0, ore: 0 });
  });

  it('two factories near the same forest count it twice', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 1 }),
      tile(1, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 1 }),
      tile(0, 1, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, player(0)).wood).toBe(2);
  });

  it('sawmill level multiplies income', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 3 }),
      tile(1, 0, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, player(0)).wood).toBe(3);
  });

  it('mines yield level stone and level ore', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 1 }),
      tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 2 }),
    );
    expect(buildingIncome(map, player(0))).toEqual({ wood: 0, stone: 3, ore: 3 });
  });

  it('geology adds 1 ore per mine', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 1 }),
      tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 1 }),
    );
    expect(buildingIncome(map, player(0, ['geology']))).toEqual({ wood: 0, stone: 2, ore: 4 });
  });

  it('income follows tile ownership (buildings transfer with the village)', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const sawmillTile = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 1 });
    map.tiles.push(sawmillTile, tile(1, 0, TileType.GrasslandForest, 1));
    expect(buildingIncome(map, player(0)).wood).toBe(1);
    sawmillTile.ownedBy = 1;
    const p1 = player(0);
    const p2 = { ...player(0), index: 1 };
    expect(buildingIncome(map, p1).wood).toBe(0);
    expect(buildingIncome(map, p2).wood).toBe(1);
  });

  it('ignores buildings on tiles owned by other players', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, TileType.GrasslandMountain, 1, null, { kind: 'mine', level: 1 }));
    expect(buildingIncome(map, player(0))).toEqual({ wood: 0, stone: 0, ore: 0 });
  });
});

describe('buildingYield', () => {
  it('reports what a building produces', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const sawmill = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: 'sawmill', level: 2 });
    map.tiles.push(sawmill, tile(1, 0, TileType.GrasslandForest, 0), tile(1, -1, TileType.GrasslandForest, 1));
    expect(buildingYield(map, sawmill, null)).toEqual({ wood: 4, stone: 0, ore: 0 });

    const mine = tile(2, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 3 });
    map.tiles.push(mine);
    expect(buildingYield(map, mine, null)).toEqual({ wood: 0, stone: 3, ore: 3 });
    expect(buildingYield(map, mine, player(0, ['geology']))).toEqual({ wood: 0, stone: 3, ore: 4 });

    const port = tile(3, 0, TileType.Water, 0, null, { kind: 'port', level: 1 });
    map.tiles.push(port);
    expect(buildingYield(map, port, null)).toEqual({ wood: 0, stone: 0, ore: 0 });

    expect(buildingYield(map, tile(4, 0, TileType.GrasslandLand, 0), null)).toEqual({ wood: 0, stone: 0, ore: 0 });
  });

  it('has a display name for every building kind', () => {
    expect(BUILDING_NAMES.sawmill).toBe('Sawmill');
    expect(BUILDING_NAMES.mine).toBe('Mine');
    expect(BUILDING_NAMES.port).toBe('Port');
    expect(BUILDING_NAMES.temple).toBe('Water temple');
  });
});

describe('canUsePort', () => {
  it('returns false for enemy-owned ports', () => {
    const t = tile(0, 0, TileType.Water, 1, null, { kind: 'port', level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
  it('returns true for player-owned ports', () => {
    const t = tile(0, 0, TileType.Water, 0, null, { kind: 'port', level: 1 });
    expect(canUsePort(t, player(100))).toBe(true);
  });
  it('returns false for free ports', () => {
    const t = tile(0, 0, TileType.Water, null, null, { kind: 'port', level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
  it('returns false for non-port buildings', () => {
    const t = tile(0, 0, TileType.Water, 0, null, { kind: 'mine', level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
});

describe('portDirection', () => {
  const map: GameMap = { radius: 3, tiles: [], spawns: [] };
  const villageAt = (q: number, r: number, owner = 0): MapTile =>
    tile(q, r, TileType.GrasslandLand, owner, { owner, level: 1, captureReady: false });
  const portAt = (q: number, r: number, owner = 0): MapTile =>
    tile(q, r, TileType.Water, owner, null, { kind: 'port', level: 1 });

  it('snaps to the adjacent direction for a village one tile away', () => {
    const cases: [number, number, PortDirection][] = [
      [1, 0, 'e'],
      [1, -1, 'ne'],
      [0, -1, 'nw'],
      [-1, 0, 'w'],
      [-1, 1, 'sw'],
      [0, 1, 'se'],
    ];
    for (const [q, r, expected] of cases) {
      map.tiles = [portAt(0, 0), villageAt(q, r)];
      expect(portDirection(map, map.tiles[0]!)).toBe(expected);
    }
  });

  it('uses the most closely aligned direction for a distant village', () => {
    map.tiles = [portAt(0, 0), villageAt(2, -3)];
    expect(portDirection(map, map.tiles[0]!)).toBe('ne');
  });

  it('uses the nearest owned village when several exist', () => {
    map.tiles = [portAt(0, 0), villageAt(-2, 2), villageAt(1, 0)];
    expect(portDirection(map, map.tiles[0]!)).toBe('e');
  });

  it('returns null for unowned ports and non-port buildings', () => {
    const freePort = tile(0, 0, TileType.Water, null, null, { kind: 'port', level: 1 });
    const mine = tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: 'mine', level: 1 });
    map.tiles = [freePort, mine, villageAt(2, 0)];
    expect(portDirection(map, freePort)).toBeNull();
    expect(portDirection(map, mine)).toBeNull();
  });

  it('returns null when the owner has no village', () => {
    map.tiles = [portAt(0, 0), villageAt(1, 0, 1)];
    expect(portDirection(map, map.tiles[0]!)).toBeNull();
  });
});

describe('canBuildForestTemple', () => {
  it('requires the forestTemple skill and an owned forest tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest);
    expect(canBuildForestTemple(map, forest, player(100))).toBe(false);
    expect(canBuildForestTemple(map, forest, player(100, ['forestTemple']))).toBe(true);
  });

  it('rejects unowned, non-forest, settlement, and already-built tiles', () => {
    let map: GameMap = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, null)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandLand, 0)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, { owner: 0, level: 1, captureReady: false })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, ['forestTemple']))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, null, { kind: 'sawmill', level: 1 })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, ['forestTemple']))).toBe(false);
  });
});

describe('buildBuilding forest temple', () => {
  it('builds a forest temple, deducts 10 stone + 30 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest);
    const p = player(100, ['forestTemple']);
    p.resources.stone = 10;
    expect(buildBuilding(map, forest, 'forestTemple', p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(p.resources.stone).toBe(0);
    expect(forest.building).toEqual({ kind: 'forestTemple', level: 1 });
  });
});

describe('village building capacity', () => {
  function claimedVillage(level: number): MapTile {
    const v = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level, captureReady: false });
    v.claimedByVillage = { q: 0, r: 0 };
    return v;
  }

  function claimedLand(q: number, r: number): MapTile {
    const t = tile(q, r, TileType.GrasslandLand, 0);
    t.claimedByVillage = { q: 0, r: 0 };
    return t;
  }

  function claimedForest(q: number, r: number): MapTile {
    const t = tile(q, r, TileType.GrasslandForest, 0);
    t.claimedByVillage = { q: 0, r: 0 };
    return t;
  }

  // A sawmill tile at (q,0) needs a forest neighbour; (q,-1) is one.
  function sawmillMap(level: number, buildQs: number[]): { map: GameMap; spots: MapTile[] } {
    const map: GameMap = { radius: 3, tiles: [claimedVillage(level)], spawns: [] };
    const spots = buildQs.map((q) => {
      const land = claimedLand(q, 0);
      map.tiles.push(land, claimedForest(q, -1));
      return land;
    });
    return { map, spots };
  }

  function buildSawmills(level: number, qs: number[]): number {
    const { map, spots } = sawmillMap(level, qs);
    const p = player(500, ['forestry']);
    let ok = 0;
    for (const spot of spots) {
      if (buildBuilding(map, spot, 'sawmill', p)) ok++;
    }
    return ok;
  }

  it('level 1 villages hold a single building', () => {
    const { map, spots } = sawmillMap(1, [1]);
    const p = player(500, ['forestry']);
    expect(canBuildSawmill(map, spots[0]!, p)).toBe(true);
    expect(buildBuilding(map, spots[0]!, 'sawmill', p)).toBe(true);
  });

  it('level 2 holds 2 buildings, level 3 holds 3, level 4+ holds 4', () => {
    expect(buildSawmills(2, [1, 2])).toBe(2);
    expect(buildSawmills(3, [1, 2, 3])).toBe(3);
    expect(buildSawmills(4, [1, 2, 3, 4])).toBe(4);
    expect(buildSawmills(5, [1, 2, 3, 4])).toBe(4);
  });

  it('raising a village level frees up a building slot', () => {
    const { map, spots } = sawmillMap(1, [1, 2]);
    const p = player(500, ['forestry']);
    expect(buildBuilding(map, spots[0]!, 'sawmill', p)).toBe(true);
    expect(buildBuilding(map, spots[1]!, 'sawmill', p)).toBe(false);
    map.tiles[0]!.settlement!.level = 2;
    expect(buildBuilding(map, spots[1]!, 'sawmill', p)).toBe(true);
  });

  it('buildings claimed by a different village do not count against the cap', () => {
    const map: GameMap = { radius: 3, tiles: [], spawns: [] };
    const a = claimedVillage(2);
    map.tiles.push(a);
    const b = tile(9, 0, TileType.GrasslandLand, 0, { owner: 0, level: 4, captureReady: false });
    b.claimedByVillage = { q: 9, r: 0 };
    map.tiles.push(b);
    // A building belonging to village B...
    const other = claimedLand(8, 0);
    other.claimedByVillage = { q: 9, r: 0 };
    other.building = { kind: 'sawmill', level: 1 };
    map.tiles.push(other);
    // ...does not fill village A's single level-2 slot.
    const spot = claimedLand(1, 0);
    map.tiles.push(spot, claimedForest(1, -1));
    const p = player(500, ['forestry']);
    expect(canBuildSawmill(map, spot, p)).toBe(true);
  });
});
