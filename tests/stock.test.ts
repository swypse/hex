import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import type { GameMap, MapTile } from '../src/game/map-gen';
import type { Player } from '../src/game/players';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tile-types';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { captureVillage } from '../src/game/capture';
import { applyFood } from '../src/game/food';
import { BUILDING_COSTS, buildBuilding, buildingIncomeByVillage, networkBuildingIncome } from '../src/game/buildings';
import { START_STOCK } from '../src/game/resources';
import {
  addStock,
  canAffordAt,
  capitalOf,
  migrateLegacyResources,
  networkStock,
  payAt,
  payerVillage,
  readStock,
  totalStock,
  villageNetwork,
  villageOfTile,
} from '../src/game/stock';

/** Player 0 owns villages at (0,0) and (4,0); `connected` joins them by a road
 *  along (1,0)..(3,0). A (0,3) village belongs to player 1. */
function scene(connected: boolean): { map: GameMap; a: MapTile; b: MapTile; p: Player } {
  const map = makeTestMap(6);
  const a = tileAt(map, 0, 0)!;
  const b = tileAt(map, 4, 0)!;
  for (const [v, name] of [[a, 'A'], [b, 'B']] as const) {
    v.settlement = { owner: 0, level: 1, captureReady: false, name, stock: { wood: 0, stone: 0, ore: 0, food: 0 } };
    v.ownedBy = 0;
    v.claimedByVillage = { q: v.q, r: v.r };
  }
  if (connected) {
    for (const q of [1, 2, 3]) {
      const t = tileAt(map, q, 0)!;
      t.roadOwner = 0;
      t.ownedBy = 0;
    }
  }
  const p = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1))[0]!;
  p.resources = { money: 50 };
  return { map, a, b, p };
}

const COST = { wood: 4, stone: 0, money: 10, ore: 0, food: 0 };

describe('payerVillage', () => {
  it('is the village itself, else the one claiming the tile, else the nearest own village', () => {
    const { map, a, b } = scene(false);
    expect(payerVillage(map, 0, a)).toBe(a);
    const claimed = tileAt(map, 3, 1)!;
    claimed.claimedByVillage = { q: 4, r: 0 };
    expect(payerVillage(map, 0, claimed)).toBe(b);
    // unclaimed land: nearest own village by distance
    expect(payerVillage(map, 0, tileAt(map, 1, 1)!)).toBe(a);
    expect(payerVillage(map, 0, tileAt(map, 3, 2)!)).toBe(b);
  });

  it('ignores villages of other players and is null without any own village', () => {
    const { map } = scene(false);
    tileAt(map, 0, 3)!.settlement = { owner: 1, level: 1, captureReady: false };
    expect(payerVillage(map, 1, tileAt(map, 0, 2)!)).toBe(tileAt(map, 0, 3));
    expect(payerVillage(map, 2, tileAt(map, 0, 2)!)).toBeNull();
  });
});

describe('villageOfTile', () => {
  it('maps a village or a tile of its territory to the village, nothing else', () => {
    const { map, a } = scene(false);
    const terr = tileAt(map, 1, 1)!;
    terr.ownedBy = 0;
    terr.claimedByVillage = { q: 0, r: 0 };
    expect(villageOfTile(map, 0, a)).toBe(a);
    expect(villageOfTile(map, 0, terr)).toBe(a);
    expect(villageOfTile(map, 1, terr)).toBeNull();
    expect(villageOfTile(map, 0, tileAt(map, 2, 2)!)).toBeNull();
  });
});

describe('network stock', () => {
  it('is pooled by villages connected by roads and separate otherwise', () => {
    const joined = scene(true);
    addStock(joined.a, { wood: 3, food: 5 });
    addStock(joined.b, { wood: 2, ore: 1 });
    expect(villageNetwork(joined.map, joined.a)).toEqual([joined.a, joined.b]);
    expect(networkStock(joined.map, joined.a)).toEqual({ wood: 5, stone: 0, ore: 1, food: 5 });
    expect(networkStock(joined.map, joined.b)).toEqual({ wood: 5, stone: 0, ore: 1, food: 5 });

    const apart = scene(false);
    addStock(apart.a, { wood: 3 });
    addStock(apart.b, { wood: 2 });
    expect(networkStock(apart.map, apart.a).wood).toBe(3);
    expect(networkStock(apart.map, apart.b).wood).toBe(2);
    expect(totalStock(apart.map, 0).wood).toBe(5);
  });
});

describe('canAffordAt / payAt', () => {
  it('takes money from the player and materials from the payer village first, then its network', () => {
    const { map, a, b, p } = scene(true);
    addStock(a, { wood: 3 });
    addStock(b, { wood: 5 });
    expect(canAffordAt(map, p, a, COST)).toBe(true); // 3 + 5 wood shared
    expect(payAt(map, p, a, COST)).toBe(true);
    expect(p.resources.money).toBe(40);
    expect(readStock(a).wood).toBe(0); // payer village emptied first
    expect(readStock(b).wood).toBe(4);
  });

  it('never reaches into a village of another network', () => {
    const { map, a, b, p } = scene(false);
    addStock(b, { wood: 50 });
    expect(canAffordAt(map, p, a, COST)).toBe(false);
    expect(payAt(map, p, a, COST)).toBe(false);
    expect(readStock(b).wood).toBe(50);
    expect(p.resources.money).toBe(50);
  });

  it('changes nothing when it cannot pay (not enough money or materials)', () => {
    const { map, a, p } = scene(false);
    addStock(a, { wood: 4 });
    p.resources.money = 9;
    expect(payAt(map, p, a, COST)).toBe(false);
    expect(readStock(a).wood).toBe(4);
    expect(p.resources.money).toBe(9);
  });

  it('a money-only cost needs no village at all', () => {
    const { map, a, p } = scene(false);
    a.settlement!.owner = null;
    expect(canAffordAt(map, p, a, { wood: 0, stone: 0, money: 10, ore: 0, food: 0 })).toBe(true);
    expect(canAffordAt(map, p, a, COST)).toBe(false);
  });

  it('a building is paid by the village whose territory it stands on', () => {
    const { map, a, b, p } = scene(false);
    addStock(a, { wood: 100 });
    addStock(b, { wood: 100 });
    const site = tileAt(map, 3, 1)!;
    site.ownedBy = 0;
    site.claimedByVillage = { q: 4, r: 0 };
    p.skills = ['agriculture'];
    expect(buildBuilding(map, site, 'farm', p)).toBe(true);
    expect(readStock(b).wood).toBe(100 - BUILDING_COSTS.farm.wood);
    expect(readStock(a).wood).toBe(100);
  });
});

describe('building income goes to villages', () => {
  function sawmillScene(): { map: GameMap; a: MapTile; b: MapTile; p: Player } {
    const s = scene(false);
    const saw = tileAt(s.map, 4, 1)!;
    saw.building = { kind: 'sawmill', level: 1 };
    saw.ownedBy = 0;
    saw.claimedByVillage = { q: 4, r: 0 };
    tileAt(s.map, 5, 1)!.terrain = TileType.GrasslandForest;
    return s;
  }

  it('credits the village claiming the building and totals per network', () => {
    const { map, a, b, p } = sawmillScene();
    const income = buildingIncomeByVillage(map, p);
    expect(income.get(b)).toEqual({ wood: 1, stone: 0, ore: 0 });
    expect(income.has(a)).toBe(false);
    expect(networkBuildingIncome(map, p, b).wood).toBe(1);
    expect(networkBuildingIncome(map, p, a).wood).toBe(0);
  });

  it('shares the network total once the villages are connected', () => {
    const { map, a, p } = sawmillScene();
    for (const q of [1, 2, 3]) {
      const t = tileAt(map, q, 0)!;
      t.roadOwner = 0;
      t.ownedBy = 0;
    }
    expect(networkBuildingIncome(map, p, a).wood).toBe(1);
  });

  it('the round-end income lands in the village stock, not on the player', () => {
    const { map, a, b, p } = sawmillScene();
    const players = [p, buildPlayers(Tribe.Villagers, 1, new SeededRandom(2))[1]!];
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, disablePirates: true });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(readStock(b).wood).toBe(1);
    expect(readStock(a).wood).toBe(0);
    expect(Object.keys(p.resources)).toEqual(['money']);
  });
});

describe('capturing a village', () => {
  it('gives the captor the village stock and the food in its granaries', () => {
    const map = makeTestMap(4);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 1, captureReady: true, stock: { wood: 7, stone: 3, ore: 2, food: 11 } };
    village.ownedBy = 1;
    village.claimedByVillage = { q: 0, r: 0 };
    const granary = tileAt(map, 1, 0)!;
    granary.building = { kind: 'granary', level: 1, food: 30 };
    granary.ownedBy = 1;
    granary.claimedByVillage = { q: 0, r: 0 };
    const capturer = makeUnit('c', 0, 'warrior', 0, 0);
    village.unit = capturer;
    captureVillage(map, village, capturer);
    expect(village.settlement!.owner).toBe(0);
    expect(village.settlement!.stock).toEqual({ wood: 7, stone: 3, ore: 2, food: 11 });
    expect(granary.ownedBy).toBe(0);
    expect(granary.building!.food).toBe(30);
  });

  it('a village captured empty starts with no stock', () => {
    const map = makeTestMap(4);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: null, level: 1, captureReady: true };
    village.claimedByVillage = { q: 0, r: 0 };
    const capturer = makeUnit('c', 0, 'warrior', 0, 0);
    village.unit = capturer;
    captureVillage(map, village, capturer);
    expect(readStock(village)).toEqual({ wood: 0, stone: 0, ore: 0, food: 0 });
  });
});

describe('food reserve per network', () => {
  it('units eat the food held by their own network only', () => {
    const { map, a, b, p } = scene(false);
    for (const v of [a, b]) {
      const u = makeUnit(`w${v.q}`, 0, 'warrior', v.q, v.r + 1);
      u.spawnVillage = { q: v.q, r: v.r };
      tileAt(map, v.q, v.r + 1)!.unit = u;
    }
    addStock(a, { food: 0 });
    addStock(b, { food: 10 });
    const reports = applyFood(map, p);
    // A has nothing to eat: its warrior starves while B's is fed from B's food.
    expect(reports.map((r) => r.village)).toEqual([a]);
    expect(readStock(a).food).toBe(0);
    expect(readStock(b).food).toBe(9);
  });

  it('connected villages share the food', () => {
    const { map, a, b, p } = scene(true);
    const u = makeUnit('w', 0, 'warrior', 0, 1);
    u.spawnVillage = { q: 0, r: 0 };
    tileAt(map, 0, 1)!.unit = u;
    addStock(b, { food: 10 });
    expect(applyFood(map, p)).toEqual([]);
    expect(readStock(b).food).toBe(9);
    expect(readStock(a).food).toBe(0);
  });
});

describe('start and legacy saves', () => {
  it('map generation gives each capital the starting materials and nothing else', async () => {
    const { generateMap } = await import('../src/game/map-gen');
    const map = generateMap(3, 5);
    const capitals = map.tiles.filter((t) => t.settlement?.capital);
    expect(capitals).toHaveLength(3);
    for (const c of capitals) expect(c.settlement!.stock).toEqual(START_STOCK);
    const free = map.tiles.filter((t) => t.settlement && !t.settlement.capital);
    for (const f of free) expect(f.settlement!.stock).toBeUndefined();
  });

  it('migrates player-wide materials into the capital once', () => {
    const { map, a, b, p } = scene(false);
    b.settlement!.capital = false;
    a.settlement!.capital = true;
    p.resources = { money: 5, wood: 6, stone: 5, ore: 4, food: 3 };
    migrateLegacyResources(map, [p]);
    expect(readStock(a)).toEqual({ wood: 6, stone: 5, ore: 4, food: 3 });
    expect(p.resources).toEqual({ money: 5 });
    migrateLegacyResources(map, [p]);
    expect(readStock(a).wood).toBe(6);
  });

  it('falls back to the most developed village when there is no capital', () => {
    const { map, a, b, p } = scene(false);
    b.settlement!.level = 3;
    expect(capitalOf(map, 0)).toBe(b);
    p.resources = { money: 0, wood: 2 };
    migrateLegacyResources(map, [p]);
    expect(readStock(b).wood).toBe(2);
    expect(readStock(a).wood).toBe(0);
  });
});
