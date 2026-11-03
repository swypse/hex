import { buildPlayers } from '@/game/players';
import { Simulator } from '@/game/simulator';
import { STORM_COOLDOWN_TURNS, STORM_DAMAGE_MAX, STORM_DAMAGE_MIN, STORM_RADIUS, stormEligible, stormReady, stormTurnsLeft, stormWaterTiles } from '@/game/units/storm';
import { TileType } from '@/game/map/tile-types';
import { Tribe } from '@/game/tribes';
import { type Unit } from '@/game/units/units';
import { SeededRandom } from '@/util';
import { CommandType, GameMode, UnitType } from '@enums';
import { beforeEach, describe, expect, it } from 'vitest';
import { giveResources, makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function freshAquaSim() {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Aqua, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Aqua;
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  const s = freshAquaSim();
  sim = s.sim;
  map = s.map;
  giveResources(sim.map, sim.players[0]!, { wood: 100, stone: 100, money: 100, ore: 100, food: 20 });
  // Village A at (0,0), its claimed water (1,1); village B at (-1,0), its own water (0,1).
  tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, 0, 0)!.ownedBy = 0;
  tileAt(map, -1, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, -1, 0)!.ownedBy = 0;
  tileAt(map, 1, 1)!.terrain = TileType.Water;
  tileAt(map, 1, 1)!.ownedBy = 0;
  tileAt(map, 1, 1)!.claimedByVillage = { q: 0, r: 0 };
  tileAt(map, 0, 1)!.terrain = TileType.Water;
  tileAt(map, 0, 1)!.ownedBy = 0;
  tileAt(map, 0, 1)!.claimedByVillage = { q: -1, r: 0 };
  tileAt(map, 1, -1)!.terrain = TileType.Water;
  tileAt(map, 1, -1)!.ownedBy = 0;
  tileAt(map, 1, -1)!.claimedByVillage = { q: 0, r: 0 };
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('a' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  return sim.map.tiles.find((t) => t.unit?.id === id)!.unit!;
}

function ship(owner: number, q: number, r: number): Unit {
  return place(owner, UnitType.WARRIOR, q, r, { hp: 200, shipLevel: 1 });
}

describe('stormcaller storm', () => {
  it('recharges for 3 turns after a cast, for the whole tribe', () => {
    const a = place(0, UnitType.STORMCALLER, 1, 0);
    const b = place(0, UnitType.STORMCALLER, 0, -1);
    expect(sim.applyCommand({ type: CommandType.STORM, unitId: a.id })).toBe(true);
    expect(sim.players[0]!.stormReadyTurn).toBe(sim.turn + STORM_COOLDOWN_TURNS);
    expect(stormTurnsLeft(sim.players[0]!, sim.turn)).toBe(STORM_COOLDOWN_TURNS);
    expect(sim.applyCommand({ type: CommandType.STORM, unitId: b.id })).toBe(false);
    expect(stormReady(sim.players[0]!, sim.turn + STORM_COOLDOWN_TURNS - 1)).toBe(false);
    expect(stormReady(sim.players[0]!, sim.turn + STORM_COOLDOWN_TURNS)).toBe(true);
  });

  it('is refused when no water is within the storm radius', () => {
    for (const t of sim.map.tiles) t.terrain = TileType.GrasslandLand;
    const stormcaller = place(0, UnitType.STORMCALLER, 2, 0);
    expect(sim.applyCommand({ type: CommandType.STORM, unitId: stormcaller.id })).toBe(false);
  });

  it('works on any tile, owned or not, and covers only water within the radius', () => {
    const big = makeTestMap(8);
    for (const t of big.tiles) t.terrain = TileType.Water;
    const caller = makeUnit('sc', 0, UnitType.STORMCALLER, 0, 0);
    tileAt(big, 0, 0)!.unit = caller;
    const tiles = stormWaterTiles(big, caller);
    expect(tiles.length).toBe(1 + 3 * STORM_RADIUS * (STORM_RADIUS + 1));
    expect(tiles.every((t) => Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r)) <= STORM_RADIUS)).toBe(true);
    expect(stormEligible(big, caller)).toBe(true);
  });

  it('strikes enemy and pirate ships on water in range whoever owns it, not own ships', () => {
    const stormcaller = place(0, UnitType.STORMCALLER, 1, 0);
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 1, 0)!.claimedByVillage = { q: 0, r: 0 };
    const villageA = { q: 0, r: 0 };
    // add a third village-A water tile for a pirate ship
    tileAt(map, 1, 2)!.terrain = TileType.Water;
    tileAt(map, 1, 2)!.ownedBy = 0;
    tileAt(map, 1, 2)!.claimedByVillage = villageA;
    void villageA;
    const enemyShip = ship(1, 1, 1);
    const ownShip = ship(0, 1, -1);
    const pirateShip = place(-1, UnitType.PIRATE, 1, 2, { hp: 200, shipLevel: 1 });
    const otherShip = ship(1, 0, 1); // village B water (0,1) claimed by (-1,0)
    const ok = sim.applyCommand({ type: CommandType.STORM, unitId: stormcaller.id });
    expect(ok).toBe(true);
    const lost = (id: string): number => 200 - findUnit(id).hp;
    expect(lost(enemyShip.id)).toBeGreaterThanOrEqual(STORM_DAMAGE_MIN);
    expect(lost(enemyShip.id)).toBeLessThanOrEqual(STORM_DAMAGE_MAX);
    expect(findUnit(ownShip.id).hp).toBe(200); // own ship untouched
    expect(lost(pirateShip.id)).toBeGreaterThanOrEqual(STORM_DAMAGE_MIN); // pirate reduced too
    expect(lost(pirateShip.id)).toBeLessThanOrEqual(STORM_DAMAGE_MAX);
    expect(lost(otherShip.id)).toBeGreaterThanOrEqual(STORM_DAMAGE_MIN); // ownership of the water does not matter
    expect(findUnit(stormcaller.id).hasMoved).toBe(true);
    expect(findUnit(stormcaller.id).hasAttacked).toBe(true);
  });

  it('is allowed from a ship standing on an owned village water tile', () => {
    const stormcaller = place(0, UnitType.STORMCALLER, 1, 1, { shipLevel: 1 });
    const enemyShip = ship(1, 1, -1); // another village-A water tile
    expect(sim.applyCommand({ type: CommandType.STORM, unitId: stormcaller.id })).toBe(true);
    expect(200 - findUnit(enemyShip.id).hp).toBeGreaterThanOrEqual(STORM_DAMAGE_MIN);
    expect(200 - findUnit(enemyShip.id).hp).toBeLessThanOrEqual(STORM_DAMAGE_MAX);
  });
});
