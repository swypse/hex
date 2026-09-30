import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import type { GameMap, MapTile } from '../src/game/map-gen';
import type { Player } from '../src/game/players';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/tile-types';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { START_RESOURCES } from '../src/game/resources';
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
} from '../src/game/buildings';
import {
  FARM_FOOD,
  FARM_FOOD_SCIENCE,
  STARVATION_DAMAGE,
  applyFood,
  farmYield,
  foodNetIncome,
  villageFood,
  canSustainUnit,
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
  p.resources = { ...START_RESOURCES, money: 100, wood: 100, stone: 100 };
  return { map, p, village };
}

function addUnit(map: GameMap, type: UnitType, q: number, r: number, owner = 0, home: { q: number; r: number } | null = { q: 0, r: 0 }): void {
  const u = makeUnit(`${type}-${q},${r}`, owner, type, q, r);
  u.spawnVillage = home;
  tileAt(map, q, r)!.unit = u;
}

describe('food resource', () => {
  it('starts every player with 40 food', () => {
    expect(START_RESOURCES.food).toBe(40);
    expect(buildPlayers(Tribe.Villagers, 1, new SeededRandom(1))[0]!.resources.food).toBe(40);
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

  it('cost 15 money, 5 wood and 2 stone and do not use a village building slot', () => {
    const { map, p, village: v } = setup();
    p.skills.push('agriculture');
    expect(BUILDING_COSTS.farm).toEqual({ money: 15, wood: 5, stone: 2, ore: 0, food: 0 });
    const before = { ...p.resources };
    expect(buildBuilding(map, tileAt(map, 1, 0)!, 'farm', p)).toBe(true);
    expect(p.resources.money).toBe(before.money - 15);
    expect(p.resources.wood).toBe(before.wood - 5);
    expect(p.resources.stone).toBe(before.stone - 2);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'farm', level: 1 });
    expect(buildingsInVillage(map, v)).toBe(0);
  });

  it('yield 3 food, 4 with Science', () => {
    const { p } = setup();
    expect(farmYield(p)).toBe(FARM_FOOD);
    p.skills.push('science');
    expect(farmYield(p)).toBe(FARM_FOOD_SCIENCE);
    expect([FARM_FOOD, FARM_FOOD_SCIENCE]).toEqual([3, 4]);
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

  it('gain 1 food per adjacent farm at round end', () => {
    const { map, p } = setup();
    tileAt(map, 1, 0)!.building = { kind: 'granary', level: 1, food: 0 };
    tileAt(map, 1, -1)!.building = { kind: 'farm', level: 1 };
    tileAt(map, 0, 1)!.building = { kind: 'farm', level: 1 };
    applyFood(map, p);
    expect(tileAt(map, 1, 0)!.building!.food).toBe(2);
    applyFood(map, p);
    expect(tileAt(map, 1, 0)!.building!.food).toBe(4);
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
    expect(f).toMatchObject({ production: 3, upkeep: 4, balance: -1, starving: false });
    expect(foodNetIncome(map, p)).toBe(-1);
  });

  it('farms of a village occupied by an enemy produce nothing', () => {
    const { map, p, village: v } = setup();
    tileAt(map, 1, 0)!.building = { kind: 'farm', level: 1 };
    v.unit = makeUnit('e', 1, 'warrior', 0, 0);
    expect(villageFood(map, v, p).production).toBe(0);
  });

  it('surplus is added to the stock and deficits are paid from it', () => {
    const { map, p } = setup();
    p.resources.food = 10;
    tileAt(map, 1, 0)!.building = { kind: 'farm', level: 1 };
    addUnit(map, 'warrior', 0, 1);
    expect(applyFood(map, p)).toEqual([]);
    expect(p.resources.food).toBe(12); // +3 farm -1 warrior
    tileAt(map, 1, 0)!.building = null;
    applyFood(map, p);
    expect(p.resources.food).toBe(11);
  });

  it('a village that cannot feed its units starves: each unit loses 5 hp', () => {
    const { map, p, village: v } = setup();
    p.resources.food = 0;
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
    expect(p.resources.food).toBe(0);
  });

  it('starvation never drops a unit below 1 hp and clears once the village is fed again', () => {
    const { map, p, village: v } = setup();
    p.resources.food = 0;
    addUnit(map, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit!.hp = 3;
    applyFood(map, p);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(1);
    expect(v.settlement!.starving).toBe(true);
    p.resources.food = 5;
    applyFood(map, p);
    expect(v.settlement!.starving).toBe(false);
    expect(p.resources.food).toBe(4);
  });

  it('a starving village eats from its granaries before it starves', () => {
    const { map, p, village: v } = setup();
    p.resources.food = 0;
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
    p.resources.food = 2;
    addUnit(map, 'swordsman', 0, 1);
    expect(foodPressure(map, p)).toBe('urgent');
    p.resources.food = 50;
    expect(canSustainUnit(map, p, 'swordsman')).toBe(true);
    p.resources.food = 4;
    expect(canSustainUnit(map, p, 'swordsman')).toBe(false);
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
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.currentPlayerIndex = 1;
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'burn', unitId: 'raider' })).toBe(true);
    expect(tile.building).toBeNull();
    expect(sim.drainEvents()).toContainEqual({ type: 'burned', unitId: 'raider', kind: 'farm', q: 1, r: 0, playerIndex: 1 });
    expect(sim.applyCommand({ type: 'burn', unitId: 'raider' })).toBe(false);
  });
});

describe('round end', () => {
  it('the simulator runs the food step and reports starvation', () => {
    const { map, p } = setup();
    p.resources.food = 0;
    addUnit(map, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0] = p;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    for (let i = 0; i < players.length; i++) sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(events.find((e) => e.type === 'starvation')).toMatchObject({ type: 'starvation', q: 0, r: 0, playerIndex: 0 });
    expect(tileAt(map, 0, 1)!.unit!.hp).toBeLessThan(50);
  });

  it('old saves without a food stock get the starting food', () => {
    const { map } = setup();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    delete (players[0]!.resources as Partial<typeof players[0]['resources']>).food;
    const sim = Simulator.fromSnapshot({
      map, players, mode: 'capture', turn: 1, currentPlayerIndex: 0, gameOver: false, winnerIndex: null, expectedTurns: 10, bonusAwarded: false,
    });
    expect(sim.players[0]!.resources.food).toBe(40);
  });
});
