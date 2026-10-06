import { describe, it, expect } from 'vitest';
import { type GameMap, type MapTile, type Settlement } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { buildBuilding, buildingIncome, buildingYield, BUILDING_NAMES, canBuildSawmill, canBuildForestTemple, canBuildMine, canBuildPort, canBuildTemple, canRepairBuilding, canUsePort, repairBuilding, destroyBuilding, DESTROY_BUILDING_COST, REPAIR_COST, BUILDING_MAX_HP, buildingHp, SAWMILL_COST, MINE_COST, portDirection } from '../src/game/economy/buildings';
import { BuildingKind, PortDirection, SkillId, UnitType } from '@enums';

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
    resources: { wood: 0, stone: 0, money, ore: 0, food: 20 },
    isActive: true,
    score: 0,
    kills: 0,
    skills,
  };
}

/** A village of player 0 holding `stock`, added away from the test tiles: it
 *  pays the materials of whatever the test builds. */
function addVillage(map: GameMap, stock: Partial<Record<'wood' | 'stone' | 'ore' | 'food', number>> = {}): MapTile {
  const village = tile(9, 9, TileType.GrasslandLand, 0, {
    owner: 0, level: 1, captureReady: false, stock: { wood: 0, stone: 0, ore: 0, food: 0, ...stock },
  });
  map.tiles.push(village);
  return village;
}

// (1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1) are the neighbors of (0,0).

describe('canBuildSawmill', () => {
  it('requires forestry, an owned land tile adjacent to a forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 1));
    expect(canBuildSawmill(map, land, player(100))).toBe(false);
    expect(canBuildSawmill(map, land, player(100, [SkillId.FORESTRY]))).toBe(true);
  });

  it('rejects unowned, non-land, forestless, settlement, and already-built tiles', () => {
    const unowned = tile(0, 0, TileType.GrasslandLand, null);
    let map: GameMap = { radius: 2, tiles: [unowned], spawns: [] };
    expect(canBuildSawmill(map, unowned, player(100, [SkillId.FORESTRY]))).toBe(false);

    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map = { radius: 2, tiles: [forest, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, forest, player(100, [SkillId.FORESTRY]))).toBe(false);

    const noForest = tile(0, 0, TileType.GrasslandLand, 0);
    map = { radius: 2, tiles: [noForest], spawns: [] };
    expect(canBuildSawmill(map, noForest, player(100, [SkillId.FORESTRY]))).toBe(false);

    const withSettlement = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level: 1, captureReady: false });
    map = { radius: 2, tiles: [withSettlement, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, withSettlement, player(100, [SkillId.FORESTRY]))).toBe(false);

    const built = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
    map = { radius: 2, tiles: [built, tile(1, 0, TileType.GrasslandForest, 0)], spawns: [] };
    expect(canBuildSawmill(map, built, player(100, [SkillId.FORESTRY]))).toBe(false);
  });
});

describe('canBuildMine', () => {
  it('requires smithery and an owned mountain tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    expect(canBuildMine(map, mountain, player(100))).toBe(false);
    expect(canBuildMine(map, mountain, player(100, [SkillId.SMITHERY]))).toBe(true);
    const unowned = tile(1, 0, TileType.GrasslandMountain, null);
    map.tiles.push(unowned);
    expect(canBuildMine(map, unowned, player(100, [SkillId.SMITHERY]))).toBe(false);
    const land = tile(0, 1, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildMine(map, land, player(100, [SkillId.SMITHERY]))).toBe(false);
  });
});

describe('canBuildPort', () => {
  it('requires the water skill, an owned water tile, and an adjacent owned land tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    // Owned water alone (no land shore) is not enough.
    expect(canBuildPort(map, water, player(100, [SkillId.WATER]))).toBe(false);
    const land = tile(1, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildPort(map, water, player(100))).toBe(false);
    expect(canBuildPort(map, water, player(100, [SkillId.WATER]))).toBe(true);
    const otherLand = tile(2, 0, TileType.GrasslandLand, 0);
    map.tiles.push(otherLand);
    expect(canBuildPort(map, land, player(100, [SkillId.WATER]))).toBe(false);
    const unowned = tile(0, 1, TileType.Water, null);
    map.tiles.push(unowned);
    expect(canBuildPort(map, unowned, player(100, [SkillId.WATER]))).toBe(false);
  });

  it('rejects an owned water tile whose only shore is unowned or foreign land', () => {
    let map: GameMap = { radius: 3, tiles: [], spawns: [] };
    const unownedShore = tile(0, 0, TileType.Water, 0);
    map.tiles.push(unownedShore, tile(1, 0, TileType.GrasslandLand, null));
    expect(canBuildPort(map, unownedShore, player(100, [SkillId.WATER]))).toBe(false);

    map = { radius: 3, tiles: [], spawns: [] };
    const foreignShore = tile(0, 0, TileType.Water, 0);
    map.tiles.push(foreignShore, tile(1, 0, TileType.GrasslandLand, 1));
    expect(canBuildPort(map, foreignShore, player(100, [SkillId.WATER]))).toBe(false);
  });
});

describe('canBuildTemple', () => {
  it('requires the waterTemples skill and an owned water tile', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    expect(canBuildTemple(map, water, player(100))).toBe(false);
    expect(canBuildTemple(map, water, player(100, [SkillId.WATER_TEMPLES]))).toBe(true);
    const land = tile(1, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land);
    expect(canBuildTemple(map, land, player(100, [SkillId.WATER_TEMPLES]))).toBe(false);
    const unowned = tile(0, 1, TileType.Water, null);
    map.tiles.push(unowned);
    expect(canBuildTemple(map, unowned, player(100, [SkillId.WATER_TEMPLES]))).toBe(false);
  });

  it('rejects tiles with a settlement or any building (port mutual exclusion)', () => {
    const withPort = tile(0, 0, TileType.Water, 0, null, { kind: BuildingKind.PORT, level: 1 });
    const map: GameMap = { radius: 2, tiles: [withPort], spawns: [] };
    expect(canBuildTemple(map, withPort, player(100, [SkillId.WATER_TEMPLES]))).toBe(false);
    expect(canBuildPort(map, withPort, player(100, [SkillId.WATER]))).toBe(false);
  });
});

describe('buildBuilding', () => {
  it('builds a sawmill, deducts 10 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(20, [SkillId.FORESTRY]);
    expect(buildBuilding(map, land, BuildingKind.SAWMILL, p)).toBe(true);
    expect(p.resources.money).toBe(20 - SAWMILL_COST);
    expect(land.building).toEqual({ kind: BuildingKind.SAWMILL, level: 1 });
  });

  it('builds a mine, deducts 15 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const mountain = tile(0, 0, TileType.GrasslandMountain, 0);
    map.tiles.push(mountain);
    const p = player(20, [SkillId.SMITHERY]);
    expect(buildBuilding(map, mountain, BuildingKind.MINE, p)).toBe(true);
    expect(p.resources.money).toBe(20 - MINE_COST);
    expect(mountain.building).toEqual({ kind: BuildingKind.MINE, level: 1 });
  });

  it('builds a port, deducts 10 wood + 30 money + 2 ore, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water, tile(1, 0, TileType.GrasslandLand, 0));
    const p = player(100, [SkillId.WATER]);
    const village = addVillage(map, { wood: 10, ore: 2 });
    expect(buildBuilding(map, water, BuildingKind.PORT, p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(village.settlement!.stock!.wood).toBe(0);
    expect(village.settlement!.stock!.ore).toBe(0);
    expect(water.building).toEqual({ kind: BuildingKind.PORT, level: 1 });
  });

  it('builds a temple, deducts 10 stone + 30 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const water = tile(0, 0, TileType.Water, 0);
    map.tiles.push(water);
    const p = player(100, [SkillId.WATER_TEMPLES]);
    const village = addVillage(map, { stone: 10 });
    expect(buildBuilding(map, water, BuildingKind.TEMPLE, p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(village.settlement!.stock!.stone).toBe(0);
    expect(water.building).toEqual({ kind: BuildingKind.TEMPLE, level: 1 });
  });

  it('fails without the required skill', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(20);
    expect(buildBuilding(map, land, BuildingKind.SAWMILL, p)).toBe(false);
    expect(land.building).toBeNull();
  });

  it('fails without enough money and does not place the building', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const land = tile(0, 0, TileType.GrasslandLand, 0);
    map.tiles.push(land, tile(1, 0, TileType.GrasslandForest, 0));
    const p = player(SAWMILL_COST - 1, [SkillId.FORESTRY]);
    expect(buildBuilding(map, land, BuildingKind.SAWMILL, p)).toBe(false);
    expect(land.building).toBeNull();
  });
});

describe('buildingIncome', () => {
  it('sawmill yields level wood per adjacent forest', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const f1 = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
    map.tiles.push(
      f1,
      tile(1, 0, TileType.GrasslandForest, 0),
      tile(1, -1, TileType.GrasslandForest, 1),
    );
    expect(buildingIncome(map, player(0))).toEqual({ wood: 2, stone: 0, ore: 0 });
  });

  it('yields nothing from a territory whose owning village has an enemy on it', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const village = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level: 2, captureReady: false });
    village.claimedByVillage = { q: 0, r: 0 };
    village.unit = {
      id: 'e', owner: 1, type: UnitType.WARRIOR, q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const sawmill = tile(1, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
    sawmill.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, sawmill, tile(2, 0, TileType.GrasslandForest, 0));
    expect(buildingIncome(map, player(0))).toEqual({ wood: 0, stone: 0, ore: 0 });
  });

  it('keeps yielding from other villages when one is enemy-occupied', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const blocked = tile(0, 0, TileType.GrasslandLand, 0, { owner: 0, level: 2, captureReady: false });
    blocked.claimedByVillage = { q: 0, r: 0 };
    blocked.unit = {
      id: 'e', owner: 1, type: UnitType.WARRIOR, q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    const blockedSaw = tile(1, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
    blockedSaw.claimedByVillage = { q: 0, r: 0 };
    const free = tile(3, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
    free.claimedByVillage = { q: 3, r: 0 };
    map.tiles.push(blocked, blockedSaw, free, tile(2, 0, TileType.GrasslandForest, 0));
    // Free sawmill still sees its own adjacent forest at (2,0).
    expect(buildingIncome(map, player(0))).toEqual({ wood: 1, stone: 0, ore: 0 });
  });

  it('two factories near the same forest count it twice', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 }),
      tile(1, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 }),
      tile(0, 1, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, player(0)).wood).toBe(2);
  });

  it('sawmill level multiplies income', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 3 }),
      tile(1, 0, TileType.GrasslandForest, 0),
    );
    expect(buildingIncome(map, player(0)).wood).toBe(3);
  });

  it('mines yield level stone and level ore', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 1 }),
      tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 2 }),
    );
    expect(buildingIncome(map, player(0))).toEqual({ wood: 0, stone: 3, ore: 3 });
  });

  it('geology adds 1 stone and 1 ore per mine', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 1 }),
      tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 1 }),
    );
    expect(buildingIncome(map, player(0, [SkillId.GEOLOGY]))).toEqual({ wood: 0, stone: 4, ore: 4 });
  });

  it('income follows tile ownership (buildings transfer with the village)', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const sawmillTile = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 1 });
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
    map.tiles.push(tile(0, 0, TileType.GrasslandMountain, 1, null, { kind: BuildingKind.MINE, level: 1 }));
    expect(buildingIncome(map, player(0))).toEqual({ wood: 0, stone: 0, ore: 0 });
  });
});

describe('buildingYield', () => {
  it('reports what a building produces', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const sawmill = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.SAWMILL, level: 2 });
    map.tiles.push(sawmill, tile(1, 0, TileType.GrasslandForest, 0), tile(1, -1, TileType.GrasslandForest, 1));
    expect(buildingYield(map, sawmill, null)).toEqual({ wood: 4, stone: 0, ore: 0 });

    const mine = tile(2, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 3 });
    map.tiles.push(mine);
    expect(buildingYield(map, mine, null)).toEqual({ wood: 0, stone: 3, ore: 3 });
    expect(buildingYield(map, mine, player(0, [SkillId.GEOLOGY]))).toEqual({ wood: 0, stone: 4, ore: 4 });

    const port = tile(3, 0, TileType.Water, 0, null, { kind: BuildingKind.PORT, level: 1 });
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
    const t = tile(0, 0, TileType.Water, 1, null, { kind: BuildingKind.PORT, level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
  it('returns true for player-owned ports', () => {
    const t = tile(0, 0, TileType.Water, 0, null, { kind: BuildingKind.PORT, level: 1 });
    expect(canUsePort(t, player(100))).toBe(true);
  });
  it('returns false for free ports', () => {
    const t = tile(0, 0, TileType.Water, null, null, { kind: BuildingKind.PORT, level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
  it('returns false for non-port buildings', () => {
    const t = tile(0, 0, TileType.Water, 0, null, { kind: BuildingKind.MINE, level: 1 });
    expect(canUsePort(t, player(100))).toBe(false);
  });
});

describe('portDirection', () => {
  const map: GameMap = { radius: 3, tiles: [], spawns: [] };
  const villageAt = (q: number, r: number, owner = 0): MapTile =>
    tile(q, r, TileType.GrasslandLand, owner, { owner, level: 1, captureReady: false });
  const portAt = (q: number, r: number, owner = 0): MapTile =>
    tile(q, r, TileType.Water, owner, null, { kind: BuildingKind.PORT, level: 1 });

  it('snaps to the adjacent owned land tile, one hex away in any direction', () => {
    const cases: [number, number, PortDirection][] = [
      [1, 0, PortDirection.E],
      [1, -1, PortDirection.NE],
      [0, -1, PortDirection.NW],
      [-1, 0, PortDirection.W],
      [-1, 1, PortDirection.SW],
      [0, 1, PortDirection.SE],
    ];
    for (const [q, r, expected] of cases) {
      map.tiles = [portAt(0, 0), villageAt(q, r)];
      expect(portDirection(map, map.tiles[0]!)).toBe(expected);
    }
  });

  it('picks the first adjacent owned land in canonical order when several exist', () => {
    // Both (1,0) 'e' and (0,-1) 'nw' are owned land; the canonical order
    // (e → ne → nw → w → sw → se) selects 'e'.
    map.tiles = [portAt(0, 0), villageAt(1, 0), villageAt(0, -1)];
    expect(portDirection(map, map.tiles[0]!)).toBe(PortDirection.E);
  });

  it('prefers the port owner land and ignores an adjacent foreign-owned shore', () => {
    // Own land west ('w'), foreign land east ('e'); only the owner's land docks.
    map.tiles = [portAt(0, 0), villageAt(-1, 0), tile(1, 0, TileType.GrasslandLand, 1, { owner: 1, level: 1, captureReady: false })];
    expect(portDirection(map, map.tiles[0]!)).toBe(PortDirection.W);
  });

  it('prefers adjacent owner land claimed by the same village as the port tile', () => {
    const port = portAt(0, 0);
    port.claimedByVillage = { q: 0, r: 0 };
    // 'e' is the owner's land but belongs to a different village; 'nw' belongs
    // to the port tile's home village.
    const otherOwn = villageAt(1, 0);
    otherOwn.claimedByVillage = { q: 9, r: 9 };
    const home = villageAt(0, -1);
    home.claimedByVillage = { q: 0, r: 0 };
    map.tiles = [port, otherOwn, home];
    expect(portDirection(map, port)).toBe(PortDirection.NW);
  });

  it('falls back to any owner adjacent land when none is from the port village', () => {
    const port = portAt(0, 0);
    port.claimedByVillage = { q: 0, r: 0 };
    const otherOwn = villageAt(1, 0);
    otherOwn.claimedByVillage = { q: 9, r: 9 };
    map.tiles = [port, otherOwn];
    expect(portDirection(map, port)).toBe(PortDirection.E);
  });

  it('ignores a distant village and unowned land when no adjacent owned land exists', () => {
    map.tiles = [portAt(0, 0), villageAt(2, -3), tile(0, 1, TileType.GrasslandLand, null, null)];
    expect(portDirection(map, map.tiles[0]!)).toBeNull();
  });

  it('ignores an adjacent foreign or unowned water tile as a dock target', () => {
    map.tiles = [portAt(0, 0), villageAt(1, 0), tile(0, 1, TileType.Water, 1, null, null)];
    expect(portDirection(map, map.tiles[0]!)).toBe(PortDirection.E);
  });

  it('returns null for unowned ports and non-port buildings', () => {
    const freePort = tile(0, 0, TileType.Water, null, null, { kind: BuildingKind.PORT, level: 1 });
    const mine = tile(1, 0, TileType.GrasslandMountain, 0, null, { kind: BuildingKind.MINE, level: 1 });
    map.tiles = [freePort, mine, villageAt(2, 0)];
    expect(portDirection(map, freePort)).toBeNull();
    expect(portDirection(map, mine)).toBeNull();
  });

  it('does not dock against a foreign shore alone', () => {
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
    expect(canBuildForestTemple(map, forest, player(100, [SkillId.FOREST_TEMPLE]))).toBe(true);
  });

  it('rejects unowned, non-forest, settlement, and already-built tiles', () => {
    let map: GameMap = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, null)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, [SkillId.FOREST_TEMPLE]))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandLand, 0)], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, [SkillId.FOREST_TEMPLE]))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, { owner: 0, level: 1, captureReady: false })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, [SkillId.FOREST_TEMPLE]))).toBe(false);
    map = { radius: 2, tiles: [tile(0, 0, TileType.GrasslandForest, 0, null, { kind: BuildingKind.SAWMILL, level: 1 })], spawns: [] };
    expect(canBuildForestTemple(map, map.tiles[0]!, player(100, [SkillId.FOREST_TEMPLE]))).toBe(false);
  });
});

describe('buildBuilding forest temple', () => {
  it('builds a forest temple, deducts 10 stone + 30 money, sets level 1', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = tile(0, 0, TileType.GrasslandForest, 0);
    map.tiles.push(forest);
    const p = player(100, [SkillId.FOREST_TEMPLE]);
    const village = addVillage(map, { stone: 10 });
    expect(buildBuilding(map, forest, BuildingKind.FOREST_TEMPLE, p)).toBe(true);
    expect(p.resources.money).toBe(70);
    expect(village.settlement!.stock!.stone).toBe(0);
    expect(forest.building).toEqual({ kind: BuildingKind.FOREST_TEMPLE, level: 1 });
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
    const p = player(500, [SkillId.FORESTRY]);
    let ok = 0;
    for (const spot of spots) {
      if (buildBuilding(map, spot, BuildingKind.SAWMILL, p)) ok++;
    }
    return ok;
  }

  it('level 1 villages hold a single building', () => {
    const { map, spots } = sawmillMap(1, [1]);
    const p = player(500, [SkillId.FORESTRY]);
    expect(canBuildSawmill(map, spots[0]!, p)).toBe(true);
    expect(buildBuilding(map, spots[0]!, BuildingKind.SAWMILL, p)).toBe(true);
  });

  it('level 2 holds 2 buildings, level 3 holds 3, level 4+ holds 4', () => {
    expect(buildSawmills(2, [1, 2])).toBe(2);
    expect(buildSawmills(3, [1, 2, 3])).toBe(3);
    expect(buildSawmills(4, [1, 2, 3, 4])).toBe(4);
    expect(buildSawmills(5, [1, 2, 3, 4])).toBe(4);
  });

  it('raising a village level frees up a building slot', () => {
    const { map, spots } = sawmillMap(1, [1, 2]);
    const p = player(500, [SkillId.FORESTRY]);
    expect(buildBuilding(map, spots[0]!, BuildingKind.SAWMILL, p)).toBe(true);
    expect(buildBuilding(map, spots[1]!, BuildingKind.SAWMILL, p)).toBe(false);
    map.tiles[0]!.settlement!.level = 2;
    expect(buildBuilding(map, spots[1]!, BuildingKind.SAWMILL, p)).toBe(true);
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
    other.building = { kind: BuildingKind.SAWMILL, level: 1 };
    map.tiles.push(other);
    // ...does not fill village A's single level-2 slot.
    const spot = claimedLand(1, 0);
    map.tiles.push(spot, claimedForest(1, -1));
    const p = player(500, [SkillId.FORESTRY]);
    expect(canBuildSawmill(map, spot, p)).toBe(true);
  });
});

describe('building hp and repair', () => {
  it('buildings have a max hp of 2 and undamaged buildings read as full', () => {
    const mine: import('../src/game/map/map-gen').Building = { kind: BuildingKind.MINE, level: 1 };
    expect(BUILDING_MAX_HP).toBe(2);
    expect(buildingHp(mine)).toBe(2);
    expect(buildingHp({ ...mine, hp: 1 })).toBe(1);
    expect(buildingHp({ ...mine, hp: 0 })).toBe(0);
  });

  it('canRepairBuilding only for an owned damaged building', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const own = { ...player(0) };
    const damaged = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1, hp: 1 });
    expect(canRepairBuilding(map, damaged, own)).toBe(true);
    const full = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1 });
    expect(canRepairBuilding(map, full, own)).toBe(false);
    const foreign = tile(0, 0, TileType.GrasslandLand, 1, null, { kind: BuildingKind.MINE, level: 1, hp: 1 });
    expect(canRepairBuilding(map, foreign, own)).toBe(false);
    const none = tile(0, 0, TileType.GrasslandLand, 0);
    expect(canRepairBuilding(map, none, own)).toBe(false);
  });

  it('repairBuilding charges 2w/2s/2o/3m and restores full hp', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const p = player(3);
    const village = addVillage(map, { wood: 2, stone: 2, ore: 2, food: 20 });
    const building = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1, hp: 1 });
    expect(REPAIR_COST).toEqual({ wood: 2, stone: 2, ore: 2, money: 3, food: 0 });
    expect(repairBuilding(map, building, p)).toBe(true);
    expect(building.building!.hp).toBeUndefined();
    expect(buildingHp(building.building)).toBe(2);
    expect(p.resources.money).toBe(0);
    expect(village.settlement!.stock).toEqual({ wood: 0, stone: 0, ore: 0, food: 20 });
  });

  it('repairBuilding refuses when unaffordable', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const poor = player(0);
    const village = addVillage(map, { food: 20 });
    const building = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1, hp: 1 });
    expect(repairBuilding(map, building, poor)).toBe(false);
    expect(buildingHp(building.building)).toBe(1);
    expect(poor.resources.money).toBe(0);
    expect(village.settlement!.stock).toEqual({ wood: 0, stone: 0, ore: 0, food: 20 });
  });
});

describe('building destroy', () => {
  it('destroyBuilding demolishes an owned building for 5 money', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const p = player(5);
    p.resources = { wood: 2, stone: 2, ore: 2, money: 5, food: 20 };
    const b = tile(0, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1 });
    expect(DESTROY_BUILDING_COST).toBe(5);
    expect(destroyBuilding(map, b, p)).toBe(true);
    expect(b.building).toBeNull();
    expect(p.resources.money).toBe(0);
  });

  it('destroyBuilding refuses foreign or unaffordable buildings', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const foreign = player(5);
    foreign.resources = { wood: 2, stone: 2, ore: 2, money: 5, food: 20 };
    const other = tile(0, 0, TileType.GrasslandLand, 1, null, { kind: BuildingKind.MINE, level: 1 });
    expect(destroyBuilding(map, other, foreign)).toBe(false);
    expect(other.building).not.toBeNull();

    const poor = player(2);
    poor.resources = { wood: 2, stone: 2, ore: 2, money: 2, food: 20 };
    const own = tile(1, 0, TileType.GrasslandLand, 0, null, { kind: BuildingKind.MINE, level: 1 });
    expect(destroyBuilding(map, own, poor)).toBe(false);
    expect(own.building).not.toBeNull();
    expect(poor.resources.money).toBe(2);
  });
});
