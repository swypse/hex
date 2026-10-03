import { GameMode } from '@enums';
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import type { GameMap, MapTile } from '../src/game/map-gen';
import type { Player } from '../src/game/players';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tile-types';
import { SeededRandom } from '../src/util/random';
import { isEnemySiegeTarget, performSiege } from '../src/game/combat';
import { planFoodFixes } from '../src/game/ai-food';
import { Simulator } from '../src/game/simulator';
import { START_RESOURCES, START_STOCK } from '../src/game/resources';
import { generateMap } from '../src/game/map-gen';
import { unitFoodUpkeep, type UnitType } from '../src/game/units';
import { buildingsInVillage } from '../src/game/village';
import { SKILLS } from '../src/game/skills';
import {
  BUILDING_COSTS,
  buildBuilding,
  burnBuilding,
  canBuildFarm,
  canBuildGranary,
  canBurnBuilding,
  canBurnRoad,
  burnRoad,
} from '../src/game/buildings';
import {
  FARM_FOOD,
  GRANARY_CAPACITY,
  FARM_FOOD_SCIENCE,
  STARVATION_DAMAGE,
  applyFood,
  farmYield,
  foodNetIncome,
  villageFood,
  canSustainUnit,
  foodNetworkStates,
  foodPressure,
} from '../src/game/food';

/** Two-player test map: player 0 owns a village at (0,0) claiming radius 1. */
function setup(): { map: GameMap; p: Player; village: MapTile } {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const p = players[0]!;
  const village = tileAt(map, 0, 0)!;
  village.settlement = { owner: 0, level: 1, captureReady: false };
  for (const t of map.tiles) {
    if (Math.abs(t.q) <= 2 && Math.abs(t.r) <= 2 && Math.abs(t.q + t.r) <= 2) {
      t.ownedBy = 0;
      t.claimedByVillage = { q: 0, r: 0 };
    }
  }
  p.resources = { money: 100 };
  village.settlement.stock = { wood: 100, stone: 100, ore: 0, food: START_RESOURCES.food };
  return { map, p, village };
}

/** The food held by the test village at (0,0). */
function foodOf(map: GameMap): number {
  return tileAt(map, 0, 0)!.settlement!.stock!.food;
}

function setFood(map: GameMap, n: number): void {
  tileAt(map, 0, 0)!.settlement!.stock!.food = n;
}

function addUnit(map: GameMap, type: UnitType, q: number, r: number, owner = 0, home: { q: number; r: number } | null = { q: 0, r: 0 }): void {
  const u = makeUnit(`${type}-${q},${r}`, owner, type, q, r);
  u.spawnVillage = home;
  tileAt(map, q, r)!.unit = u;
}

describe('food resource', () => {
  it('gives every capital 25 food at the start; money alone stays with the player', () => {
    expect(START_RESOURCES.food).toBe(25);
    expect(START_STOCK.food).toBe(25);
    expect(buildPlayers(Tribe.Villagers, 1, new SeededRandom(1))[0]!.resources).toEqual({ money: START_RESOURCES.money + 8 });
    const map = generateMap(2, 1);
    const capitals = map.tiles.filter((t) => t.settlement?.capital);
    expect(capitals).toHaveLength(2);
    for (const c of capitals) expect(c.settlement!.stock).toEqual(START_STOCK);
  });

  it('defines the unit food upkeep table', () => {
    for (const t of ['warrior', 'archer', 'rider'] as const) expect(unitFoodUpkeep(t)).toBe(1);
    for (const t of ['swordsman', 'knight', 'catapult', 'stalker', 'builder', 'banner', 'berserker', 'trapper', 'stormcaller', 'stunner'] as const) {
      expect(unitFoodUpkeep(t)).toBe(3);
    }
  });
});

describe('skills', () => {
  it('Agriculture is a root skill and Granary its child', () => {
    expect(SKILLS.agriculture.parent).toBeNull();
    expect(SKILLS.granary.parent).toBe('agriculture');
    expect(SKILLS.granary.level).toBe(2);
  });
});

describe('farms', () => {
  it('need the Agriculture skill and an own empty land tile', () => {
    const { map, p } = setup();
    const t = tileAt(map, 1, 0)!;
    expect(canBuildFarm(map, t, p)).toBe(false);
    p.skills.push('agriculture');
    expect(canBuildFarm(map, t, p)).toBe(true);
  });

  it('reject forest, mountain, water, buildings, villages and foreign land; allow roads', () => {
    const { map, p } = setup();
    p.skills.push('agriculture');
    const t = tileAt(map, 1, 0)!;
    for (const terrain of [TileType.GrasslandForest, TileType.GrasslandMountain, TileType.Water]) {
      t.terrain = terrain;
      expect(canBuildFarm(map, t, p), String(terrain)).toBe(false);
    }
    t.terrain = TileType.GrasslandLand;
    t.roadOwner = 0;
    expect(canBuildFarm(map, t, p)).toBe(true);
    t.roadOwner = null;
    t.building = { kind: 'mine', level: 1 };
    expect(canBuildFarm(map, t, p)).toBe(false);
    t.building = null;
    expect(canBuildFarm(map, village(map), p)).toBe(false);
    t.ownedBy = 1;
    expect(canBuildFarm(map, t, p)).toBe(false);
  });

  it('cannot be built while an enemy unit stands on the tile, but can with an own unit', () => {
    const { map, p } = setup();
    p.skills.push('agriculture');
    const t = tileAt(map, 1, 0)!;
    addUnit(map, 'warrior', 1, 0, 1);
    expect(canBuildFarm(map, t, p)).toBe(false);
    t.unit = null;
    addUnit(map, 'warrior', 1, 0, 0);
    expect(canBuildFarm(map, t, p)).toBe(true);
  });

  it('cost 15 money and 5 wood (no stone) and do not use a village building slot', () => {
    const { map, p, village: v } = setup();
    p.skills.push('agriculture');
    expect(BUILDING_COSTS.farm).toEqual({ money: 15, wood: 5, stone: 0, ore: 0, food: 0 });
    const before = { money: p.resources.money, ...v.settlement!.stock! };
    expect(buildBuilding(map, tileAt(map, 1, 0)!, 'farm', p)).toBe(true);
    expect(p.resources.money).toBe(before.money - 15);
    expect(v.settlement!.stock!.wood).toBe(before.wood - 5);
    expect(v.settlement!.stock!.stone).toBe(before.stone);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'farm', level: 1 });
    expect(buildingsInVillage(map, v)).toBe(0);
  });

  it('yield 2 food, 3 with Science', () => {
    const { p } = setup();
    expect(farmYield(p)).toBe(FARM_FOOD);
    p.skills.push('science');
    expect(farmYield(p)).toBe(FARM_FOOD_SCIENCE);
    expect([FARM_FOOD, FARM_FOOD_SCIENCE]).toEqual([2, 3]);
  });

  it('yield 0 food in winter, even with Science', () => {
    const { map, p } = setup();
    map.season = 'winter';
    expect(farmYield(p, map)).toBe(0);
    p.skills.push('science');
    expect(farmYield(p, map)).toBe(0);
    map.season = 'summer';
    expect(farmYield(p, map)).toBe(FARM_FOOD_SCIENCE);
  });

  it('give nothing to granaries in winter', () => {
    const { map, p } = setup();
    map.season = 'winter';
    const g = tileAt(map, 1, 0)!;
    g.building = { kind: 'granary', level: 1, food: 5 };
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    applyFood(map, p);
    expect(g.building!.food).toBe(5);
  });
});

function village(map: GameMap): MapTile {
  return tileAt(map, 0, 0)!;
}

describe('granaries', () => {
  it('need the Granary skill and an adjacent own farm', () => {
    const { map, p } = setup();
    p.skills.push('agriculture');
    const g = tileAt(map, 1, 0)!;
    expect(canBuildGranary(map, g, p)).toBe(false);
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    expect(canBuildGranary(map, g, p)).toBe(false); // skill missing
    p.skills.push('granary');
    expect(canBuildGranary(map, g, p)).toBe(true);
    tileAt(map, 1, -1)!.building = null;
    expect(canBuildGranary(map, g, p)).toBe(false); // farm gone
  });

  it('cost 20 money, 10 wood, 10 stone and start with 0 food', () => {
    const { map, p } = setup();
    p.skills.push('agriculture', 'granary');
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    expect(BUILDING_COSTS.granary).toEqual({ money: 20, wood: 10, stone: 10, ore: 0, food: 0 });
    expect(buildBuilding(map, tileAt(map, 1, 0)!, 'granary', p)).toBe(true);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'granary', level: 1, food: 0 });
  });

  it('store the unused food of adjacent farms at round end, capped at 50', () => {
    const { map, p } = setup();
    const g = tileAt(map, 1, 0)!;
    g.building = { kind: 'granary', level: 1, food: 0 };
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    tileAt(map, 0, 1)!.building = { kind: 'farm', level: 1 };
    applyFood(map, p);
    expect(g.building!.food).toBe(4);
    g.building!.food = 47;
    applyFood(map, p);
    expect(g.building!.food).toBe(GRANARY_CAPACITY);
  });

  it('only receive what the village units did not eat; farms away from granaries are eaten first', () => {
    const { map, p } = setup();
    const g = tileAt(map, 1, 0)!;
    g.building = { kind: 'granary', level: 1, food: 0 };
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 }; // next to the granary
    tileAt(map, -2, 0)!.building = { kind: 'farm', level: 1 }; // far away
    addUnit(map, 'swordsman', 0, 1); // 3
    applyFood(map, p);
    expect(g.building!.food).toBe(1); // the far farm (2) and 1 of the near farm fed the unit
    addUnit(map, 'swordsman', -1, 1); // upkeep 6 > 4 from the farms: nothing is stored, the granary is drawn
    applyFood(map, p);
    expect(g.building!.food).toBe(0);
  });

  it('farm food without a granary is lost and the starting reserve is untouched', () => {
    const { map, p } = setup();
    setFood(map, 10);
    tileAt(map, 1, 0)!.building = { kind: 'farm', level: 1 };
    addUnit(map, 'warrior', 0, 1);
    applyFood(map, p);
    expect(foodOf(map)).toBe(10);
  });

  it('a deficit drains granaries first, then the starting reserve', () => {
    const { map, p } = setup();
    setFood(map, 10);
    const g = tileAt(map, 1, 0)!;
    g.building = { kind: 'granary', level: 1, food: 2 };
    addUnit(map, 'swordsman', 0, 1); // 3
    applyFood(map, p);
    expect(g.building!.food).toBe(0);
    expect(foodOf(map)).toBe(9);
  });
});

describe('village food balance and starvation', () => {
  it('balance is farm production minus the food upkeep of the units it raised', () => {
    const { map, p, village: v } = setup();
    tileAt(map, 1, 0)!.building = { kind: 'farm', level: 1 };
    addUnit(map, 'warrior', 0, 1); // 1
    addUnit(map, 'swordsman', -1, 1); // 3
    addUnit(map, 'warrior', 1, -1, 0, null); // not raised by the village: free
    const f = villageFood(map, v, p);
    expect(f).toMatchObject({ production: 2, upkeep: 4, balance: -2, starving: false });
    expect(foodNetIncome(map, p)).toBe(-2);
  });

  it('an enemy standing on a village does not disable its farms', () => {
    const { map, p, village: v } = setup();
    tileAt(map, 1, 0)!.building = { kind: 'farm', level: 1 };
    v.unit = makeUnit('e', 1, 'warrior', 0, 0);
    expect(villageFood(map, v, p).production).toBe(2);
  });

  it('deficits are paid from the starting reserve', () => {
    const { map, p } = setup();
    setFood(map, 10);
    addUnit(map, 'warrior', 0, 1);
    expect(applyFood(map, p)).toEqual([]);
    expect(foodOf(map)).toBe(9);
  });

  it('a village that cannot feed its units starves: each unit loses 10 hp', () => {
    const { map, p, village: v } = setup();
    setFood(map, 0);
    addUnit(map, 'warrior', 0, 1);
    addUnit(map, 'swordsman', -1, 1);
    addUnit(map, 'archer', 1, -1, 0, null); // not raised here: untouched
    const reports = applyFood(map, p);
    expect(reports).toHaveLength(1);
    expect(v.settlement!.starving).toBe(true);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(50 - STARVATION_DAMAGE);
    expect(tileAt(map, -1, 1)!.unit!.hp).toBe(80 - STARVATION_DAMAGE);
    expect(tileAt(map, 1, -1)!.unit!.hp).toBe(40);
    expect(reports[0]!.units).toHaveLength(2);
    expect(foodOf(map)).toBe(0);
  });

  it('marks units that get too little food as starving and clears it once fed', () => {
    const { map, p } = setup();
    setFood(map, 1);
    addUnit(map, 'warrior', 0, 1); // fed from the reserve (swordsman-first order: same cost)
    addUnit(map, 'archer', -1, 1);
    applyFood(map, p);
    const flags = [tileAt(map, 0, 1)!.unit!.starving, tileAt(map, -1, 1)!.unit!.starving];
    expect(flags.filter(Boolean)).toHaveLength(1);
    setFood(map, 10);
    applyFood(map, p);
    expect(tileAt(map, 0, 1)!.unit!.starving).toBeFalsy();
    expect(tileAt(map, -1, 1)!.unit!.starving).toBeFalsy();
  });

  it('starvation never drops a unit below 1 hp and clears once the village is fed again', () => {
    const { map, p, village: v } = setup();
    setFood(map, 0);
    addUnit(map, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit!.hp = 3;
    applyFood(map, p);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(1);
    expect(v.settlement!.starving).toBe(true);
    setFood(map, 5);
    applyFood(map, p);
    expect(v.settlement!.starving).toBe(false);
    expect(foodOf(map)).toBe(4);
  });

  it('a starving village eats from its granaries before it starves', () => {
    const { map, p, village: v } = setup();
    setFood(map, 0);
    tileAt(map, 1, 0)!.building = { kind: 'granary', level: 1, food: 5 };
    addUnit(map, 'swordsman', 0, 1); // 3 per round
    expect(applyFood(map, p)).toEqual([]);
    expect(tileAt(map, 1, 0)!.building!.food).toBe(2);
    expect(v.settlement!.starving).toBe(false);
    const reports = applyFood(map, p);
    expect(reports).toHaveLength(1);
    expect(tileAt(map, 1, 0)!.building!.food).toBe(0);
  });

  it('pressure and sustainability helpers reflect the stock and the balance', () => {
    const { map, p } = setup();
    expect(foodPressure(map, p)).toBe('none');
    setFood(map, 2);
    addUnit(map, 'swordsman', 0, 1);
    expect(foodPressure(map, p)).toBe('urgent');
    setFood(map, 50);
    expect(canSustainUnit(map, p, 'swordsman')).toBe(true);
    setFood(map, 4);
    expect(canSustainUnit(map, p, 'swordsman')).toBe(false);
  });
});

describe('starving state refresh', () => {
  it('building or destroying a farm updates the village starving flag at once', () => {
    const { map, p, village: v } = setup();
    p.skills.push('agriculture');
    setFood(map, 0);
    addUnit(map, 'warrior', 0, 1);
    const sim = new Simulator(map, [p], GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    v.settlement!.starving = true;
    expect(sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'farm' })).toBe(true);
    expect(v.settlement!.starving).toBe(false);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(50); // nobody was hurt by the check
    expect(sim.applyCommand({ type: 'destroyBuilding', q: 1, r: 0 })).toBe(true);
    expect(v.settlement!.starving).toBe(true);
  });
});

describe('starving state on spawn', () => {
  it('spawning a unit a village cannot feed shows starvation at once', () => {
    const { map, p, village: v } = setup();
    setFood(map, 0);
    const sim = new Simulator(map, [p], GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(v.settlement!.starving).toBeFalsy();
    expect(sim.applyCommand({ type: 'spawn', q: 0, r: 0, unitType: 'warrior' })).toBe(true);
    expect(v.settlement!.starving).toBe(true);
  });
});

describe('starving state on unit death', () => {
  it('killing a unit clears starvation once the village can feed the rest', () => {
    const { map, p, village: v } = setup();
    setFood(map, 1); // feeds one warrior, not two
    addUnit(map, 'warrior', 0, 1);
    addUnit(map, 'warrior', -1, 1);
    const enemy = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1))[1]!;
    addUnit(map, 'swordsman', 1, 1, 1, null);
    tileAt(map, 0, 1)!.unit!.hp = 1;
    const sim = new Simulator(map, [p, enemy], GameMode.CAPTURE, { rng: () => 0.99 });
    sim.startGame();
    sim.currentPlayerIndex = 1;
    sim.drainEvents();
    v.settlement!.starving = true;
    expect(sim.applyCommand({ type: 'attack', unitId: 'swordsman-1,1', q: 0, r: 1 })).toBe(true);
    expect(tileAt(map, 0, 1)!.unit?.owner).not.toBe(0); // dead (the attacker may advance onto the tile)
    expect(v.settlement!.starving).toBe(false);
  });
});

describe('starving state on capture', () => {
  it('capturing a village re-evaluates it for its new owner', () => {
    const { map, p } = setup();
    const target = tileAt(map, 0, 3)!;
    // Some wood but no food: not "empty", so the capture grants no starting stock.
    target.settlement = { owner: 1, level: 1, captureReady: true, stock: { wood: 1, stone: 0, ore: 0, food: 0 } };
    target.ownedBy = 1;
    target.claimedByVillage = { q: 0, r: 3 };
    const cap = makeUnit('cap', 0, 'warrior', 0, 3); // becomes the village's unit: 1 food a round
    target.unit = cap;
    setFood(map, 0);
    const sim = new Simulator(map, [p], GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(target.settlement.starving).toBeFalsy();
    expect(sim.applyCommand({ type: 'capture', q: 0, r: 3, unitId: 'cap' })).toBe(true);
    expect(target.settlement.owner).toBe(0);
    expect(target.settlement.starving).toBe(true);
  });
});

/** Second own village B at (3,0) with a farm on its land; a road to A at (0,0)
 *  is added when `connect` is set. */
function setupNetwork(connect: boolean): { map: GameMap; p: Player; a: MapTile; b: MapTile } {
  const { map, p, village: a } = setup();
  const b = tileAt(map, 3, 0)!;
  b.settlement = { owner: 0, level: 1, captureReady: false };
  for (const [q, r] of [[3, 0], [3, -1]] as const) {
    const t = tileAt(map, q, r)!;
    t.ownedBy = 0;
    t.claimedByVillage = { q: 3, r: 0 };
  }
  tileAt(map, 3, -1)!.building = { kind: 'farm', level: 1 };
  if (connect) for (const [q, r] of [[1, 0], [2, 0]] as const) tileAt(map, q, r)!.roadOwner = 0;
  setFood(map, 0);
  return { map, p, a, b };
}

describe('food networks', () => {
  it('connected villages share farm food', () => {
    const { map, p, a } = setupNetwork(true);
    addUnit(map, 'warrior', 0, 1);
    expect(villageFood(map, a, p)).toMatchObject({ production: 2, upkeep: 1, networkSize: 2 });
    expect(applyFood(map, p)).toEqual([]);
    expect(a.settlement!.starving).toBe(false);
  });

  it('unconnected villages do not', () => {
    const { map, p, a } = setupNetwork(false);
    addUnit(map, 'warrior', 0, 1);
    expect(villageFood(map, a, p)).toMatchObject({ production: 0, networkSize: 1 });
    expect(applyFood(map, p)).toHaveLength(1);
    expect(a.settlement!.starving).toBe(true);
  });

  it('a unit short of food loses the missing share of the starvation damage', () => {
    const { map, p } = setupNetwork(true);
    tileAt(map, 3, -1)!.building = null;
    setFood(map, 2);
    addUnit(map, 'swordsman', 0, 1); // needs 3, gets 2: 1/3 of 10 hp, rounded
    applyFood(map, p);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(80 - 3);
  });

  it('feeds the most developed village first and the hungriest unit first', () => {
    const { map, p, a, b } = setupNetwork(true);
    tileAt(map, 3, -1)!.building = null;
    b.settlement!.level = 2;
    setFood(map, 3);
    addUnit(map, 'warrior', 0, 1); // village A (level 1)
    addUnit(map, 'warrior', 2, 1, 0, { q: 3, r: 0 }); // village B (level 2), fed first
    addUnit(map, 'swordsman', 3, -2, 0, { q: 3, r: 0 }); // B's hungriest unit, fed before B's warrior
    const reports = applyFood(map, p);
    expect(b.settlement!.starving).toBe(true);
    expect(a.settlement!.starving).toBe(true);
    // the reserve of 3 fed only B's swordsman: both warriors starve
    expect(tileAt(map, 3, -2)!.unit!.hp).toBe(80);
    expect(tileAt(map, 2, 1)!.unit!.hp).toBe(50 - STARVATION_DAMAGE);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(50 - STARVATION_DAMAGE);
    expect(reports).toHaveLength(2);
  });

  it('building a road re-evaluates starvation at once', () => {
    const { map, p, a } = setupNetwork(false);
    p.skills.push('roads');
    addUnit(map, 'warrior', 0, 1);
    const sim = new Simulator(map, [p], GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    p.resources = { money: 100 };
    tileAt(map, 0, 0)!.settlement!.stock = { wood: 100, stone: 100, ore: 0, food: 0 };
    tileAt(map, 1, 0)!.roadOwner = 0;
    expect(sim.applyCommand({ type: 'buildRoad', q: 2, r: 0 })).toBe(true);
    expect(a.settlement!.starving).toBe(false);
  });
});

describe('AI food planning', () => {
  it('computes the food state of each network separately', () => {
    const { map, p, a } = setupNetwork(false);
    addUnit(map, 'swordsman', 0, 1); // A: upkeep 3, no farms
    const states = foodNetworkStates(map, p);
    expect(states).toHaveLength(2);
    const stateA = states.find((n) => n.villages.includes(a))!;
    expect(stateA).toMatchObject({ production: 0, upkeep: 3, balance: -3, pressure: 'urgent' });
    expect(states.find((n) => n !== stateA)).toMatchObject({ balance: 2 });
    expect(foodPressure(map, p, a)).toBe('urgent');
    expect(canSustainUnit(map, p, 'warrior', 6, tileAt(map, 3, 0)!)).toBe(true);
    expect(canSustainUnit(map, p, 'warrior', 6, a)).toBe(false);
  });

  it('prefers roads to a surplus village over a farm when the gap is a single tile', () => {
    const { map, p } = setupNetwork(false);
    const extra = tileAt(map, 3, -2)!; // a second farm: the surplus village has more than a farm's worth
    extra.ownedBy = 0;
    extra.claimedByVillage = { q: 3, r: 0 };
    extra.building = { kind: 'farm', level: 1 };
    p.skills.push('agriculture', 'roads');
    tileAt(map, 1, 0)!.roadOwner = 0; // only (2,0) is missing
    addUnit(map, 'swordsman', 0, 1);
    const plan = planFoodFixes(map, p, foodNetworkStates(map, p));
    expect(plan.linkFirst.size).toBe(1);
    expect(plan.roads.map((r) => `${r.tile.q},${r.tile.r}`)).toContain('2,0');
  });

  it('prefers a farm when the surplus village is far away', () => {
    const { map, p } = setupNetwork(false);
    p.skills.push('agriculture', 'roads');
    addUnit(map, 'swordsman', 0, 1);
    const plan = planFoodFixes(map, p, foodNetworkStates(map, p));
    expect(plan.linkFirst.size).toBe(0);
  });

  it('plans ports on a shared lake when no farm or road is possible', () => {
    const { map, p } = setupNetwork(false);
    p.skills.push('water'); // no Agriculture, no Roads
    for (const [q, r] of [[1, 0], [2, 0]] as const) {
      const t = tileAt(map, q, r)!;
      t.terrain = TileType.Water;
      t.ownedBy = 0;
    }
    addUnit(map, 'swordsman', 0, 1);
    const plan = planFoodFixes(map, p, foodNetworkStates(map, p));
    expect(plan.linkFirst.size).toBe(1);
    expect(plan.ports.map((x) => `${x.tile.q},${x.tile.r}`).sort()).toEqual(['1,0', '2,0']);
    expect(plan.roads).toEqual([]);
  });

  it('building the second port joins the networks and ends the starvation', () => {
    const { map, p, a } = setupNetwork(false);
    p.skills.push('water');
    for (const [q, r] of [[1, 0], [2, 0]] as const) {
      const t = tileAt(map, q, r)!;
      t.terrain = TileType.Water;
      t.ownedBy = 0;
    }
    addUnit(map, 'swordsman', 0, 1);
    tileAt(map, 1, 0)!.building = { kind: 'port', level: 1 };
    tileAt(map, 2, 0)!.building = { kind: 'port', level: 1 };
    expect(villageFood(map, a, p)).toMatchObject({ networkSize: 2, production: 2 });
  });

  it('falls back to roads when no farm can be built', () => {
    const { map, p } = setupNetwork(false);
    p.skills.push('roads'); // no Agriculture: farms are impossible
    addUnit(map, 'swordsman', 0, 1);
    const plan = planFoodFixes(map, p, foodNetworkStates(map, p));
    expect(plan.linkFirst.size).toBe(1);
  });
});

describe('burning farms and granaries', () => {
  function burnSetup(kind: 'farm' | 'granary' = 'farm'): { map: GameMap; tile: MapTile; unit: ReturnType<typeof makeUnit> } {
    const { map } = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.building = kind === 'farm' ? { kind, level: 1 } : { kind, level: 1, food: 3 };
    const unit = makeUnit('raider', 1, 'warrior', 1, 0);
    tile.unit = unit;
    return { map, tile, unit };
  }

  it('an enemy unit standing on a farm or granary may burn it', () => {
    for (const kind of ['farm', 'granary'] as const) {
      const { tile, unit } = burnSetup(kind);
      expect(canBurnBuilding(tile, unit)).toBe(true);
      expect(burnBuilding(tile, unit)).toBe(true);
      expect(tile.building).toBeNull();
      expect(unit.hasMoved && unit.hasAttacked && unit.hasHealed).toBe(true);
    }
  });

  it('works right after moving but not after attacking, and not for the owner or other buildings', () => {
    const { tile, unit } = burnSetup();
    unit.hasMoved = true;
    expect(canBurnBuilding(tile, unit)).toBe(true);
    unit.hasAttacked = true;
    expect(canBurnBuilding(tile, unit)).toBe(false);
    unit.hasAttacked = false;
    unit.stunTurns = 1;
    expect(canBurnBuilding(tile, unit)).toBe(false);
    unit.stunTurns = 0;
    tile.ownedBy = 1;
    expect(canBurnBuilding(tile, unit)).toBe(false);
    tile.ownedBy = 0;
    tile.building = { kind: 'mine', level: 1 };
    expect(canBurnBuilding(tile, unit)).toBe(false);
  });

  it('the simulator burn command destroys it, emits burned and ends the unit turn', () => {
    const { map, tile } = burnSetup();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.currentPlayerIndex = 1;
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'burn', unitId: 'raider' })).toBe(true);
    expect(tile.building).toBeNull();
    expect(sim.drainEvents()).toContainEqual({ type: 'burned', unitId: 'raider', kind: 'farm', q: 1, r: 0, playerIndex: 1 });
    expect(sim.applyCommand({ type: 'burn', unitId: 'raider' })).toBe(false);
  });
});

describe('destroying roads', () => {
  function roadSetup(): { map: GameMap; tile: MapTile; unit: ReturnType<typeof makeUnit> } {
    const { map } = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.roadOwner = 0;
    const unit = makeUnit('raider', 1, 'warrior', 1, 0);
    tile.unit = unit;
    return { map, tile, unit };
  }

  it('a unit on an enemy road may destroy it, spending its whole turn', () => {
    const { tile, unit } = roadSetup();
    expect(canBurnRoad(tile, unit)).toBe(true);
    expect(burnRoad(tile, unit)).toBe(true);
    expect(tile.roadOwner).toBeNull();
    expect(unit.hasMoved && unit.hasAttacked && unit.hasHealed).toBe(true);
    expect(canBurnRoad(tile, unit)).toBe(false);
  });

  it('is unavailable after moving onto the road, after acting, for the owner and for ships', () => {
    const { tile, unit } = roadSetup();
    unit.hasMoved = true;
    expect(canBurnRoad(tile, unit)).toBe(false);
    unit.hasMoved = false;
    unit.hasAttacked = true;
    expect(canBurnRoad(tile, unit)).toBe(false);
    unit.hasAttacked = false;
    tile.roadOwner = 1;
    expect(canBurnRoad(tile, unit)).toBe(false);
    tile.roadOwner = 0;
    unit.shipLevel = 1;
    expect(canBurnRoad(tile, unit)).toBe(false);
  });

  it('an enemy farm on the tile has to be burned before its road', () => {
    const { tile, unit } = roadSetup();
    tile.building = { kind: 'farm', level: 1 };
    expect(canBurnRoad(tile, unit)).toBe(false);
    expect(burnBuilding(tile, unit)).toBe(true);
    expect(tile.roadOwner).toBe(0);
    unit.hasMoved = unit.hasAttacked = unit.hasHealed = false; // next turn
    expect(canBurnRoad(tile, unit)).toBe(true);
  });

  it('the simulator command destroys the road, emits an event and re-evaluates starvation', () => {
    const { map, tile } = roadSetup();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.currentPlayerIndex = 1;
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'burnRoad', unitId: 'raider' })).toBe(true);
    expect(tile.roadOwner).toBeNull();
    expect(sim.drainEvents()).toContainEqual({ type: 'roadBurned', unitId: 'raider', q: 1, r: 0, playerIndex: 1, owner: 0 });
    expect(sim.applyCommand({ type: 'burnRoad', unitId: 'raider' })).toBe(false);
  });

  it('a catapult may target an enemy road, but hits its building first', () => {
    const { map, tile } = roadSetup();
    tile.unit = null;
    const cat = makeUnit('cat', 1, 'catapult', 3, 0);
    tileAt(map, 3, 0)!.unit = cat;
    expect(isEnemySiegeTarget(tile, 1)).toBe(true);
    expect(isEnemySiegeTarget(tile, 0)).toBe(false);
    tile.building = { kind: 'farm', level: 1 };
    expect(performSiege(cat, tile, () => 0.99).destroyed).toBeNull(); // 2 hp: the first hit only damages
    expect(tile.roadOwner).toBe(0);
    cat.hasAttacked = false;
    expect(performSiege(cat, tile, () => 0.99).destroyed).toBe('building');
    expect(tile.building).toBeNull();
    expect(tile.roadOwner).toBe(0);
    cat.hasAttacked = false;
    expect(performSiege(cat, tile, () => 0.99).destroyed).toBe('road');
    expect(tile.roadOwner).toBeNull();
  });
});

describe('round end', () => {
  it('the simulator runs the food step and reports starvation', () => {
    const { map, p } = setup();
    setFood(map, 0);
    addUnit(map, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0] = p;
    const sim = new Simulator(map, players, GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    for (let i = 0; i < players.length; i++) sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(events.find((e) => e.type === 'starvation')).toMatchObject({ type: 'starvation', q: 0, r: 0, playerIndex: 0 });
    expect(tileAt(map, 0, 1)!.unit!.hp).toBeLessThan(50);
  });

  it('old saves without a food stock get the starting food in the capital', () => {
    const { map, village } = setup();
    village.settlement!.capital = true;
    village.settlement!.stock = undefined;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources = { money: 7, wood: 4, stone: 3, ore: 2 };
    const sim = Simulator.fromSnapshot({
      map, players, mode: GameMode.CAPTURE, turn: 1, currentPlayerIndex: 0, gameOver: false, winnerIndex: null, expectedTurns: 10, bonusAwarded: false,
    });
    expect(village.settlement!.stock).toEqual({ wood: 4, stone: 3, ore: 2, food: START_RESOURCES.food });
    expect(sim.players[0]!.resources).toEqual({ money: 7 });
  });

  it('old saves keep the player-wide materials and food in the capital', () => {
    const { map, village } = setup();
    village.settlement!.capital = true;
    village.settlement!.stock = undefined;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources = { money: 7, wood: 9, stone: 8, ore: 6, food: 11 };
    Simulator.fromSnapshot({
      map, players, mode: GameMode.CAPTURE, turn: 1, currentPlayerIndex: 0, gameOver: false, winnerIndex: null, expectedTurns: 10, bonusAwarded: false,
    });
    expect(village.settlement!.stock).toEqual({ wood: 9, stone: 8, ore: 6, food: 11 });
  });
});
