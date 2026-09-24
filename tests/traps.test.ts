import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { TileType } from '../src/game/tile-types';
import { Unit } from '../src/game/units';
import { trapDamage, TRAP_COST } from '../src/game/traps';

function freshForestSim() {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Forest, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Forest;
  const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  const s = freshForestSim();
  sim = s.sim;
  map = s.map;
  sim.players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('t' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  return sim.map.tiles.find((t) => t.unit?.id === id)!.unit!;
}

describe('trapper traps', () => {
  it('places a trap on an adjacent owned land tile, paying 5 money + 3 ore', () => {
    tileAt(map, 1, 0)!.ownedBy = 0;
    const trapper = place(0, 'trapper', 0, 0);
    const ok = sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.trap).toMatchObject({ owner: 0, placedTurn: sim.turn });
    expect(findUnit(trapper.id).hasMoved).toBe(true);
    expect(sim.players[0]!.resources.money).toBe(95);
    expect(sim.players[0]!.resources.ore).toBe(97);
    expect(TRAP_COST).toEqual({ wood: 0, stone: 0, money: 5, ore: 3 });
  });

  it('refuses traps on water, enemy tiles, settlements, or beyond one hex', () => {
    const trapper = place(0, 'trapper', 0, 0);
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 0;
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 })).toBe(false);
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 1; // enemy land
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 })).toBe(false);
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 3, r: 0 })).toBe(false);
  });

  it('an enemy unit stepping onto a trap is stopped there, killed, trap consumed', () => {
    tileAt(map, 1, 0)!.ownedBy = 0;
    const trapper = place(0, 'trapper', 0, 0);
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 })).toBe(true);
    sim.currentPlayerIndex = 1;
    sim.drainEvents();
    const enemy = place(1, 'swordsman', 0, 1); // 80 hp < 90 => dies on the trap
    // move from (0,1) onto (1,0): adjacent land, the trap waits there
    const ok = sim.applyCommand({ type: 'move', unitId: enemy.id, q: 1, r: 0 });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.unit).toBeNull(); // victim died on the trap
    expect(tileAt(map, 1, 0)!.trap).toBeNull(); // consumed
    expect(sim.drainEvents().some((e) => e.type === 'trapTriggered')).toBe(true);
  });

  it('expires a trap after 5 turns', () => {
    tileAt(map, 1, 0)!.ownedBy = 0;
    const trapper = place(0, 'trapper', 0, 0);
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 })).toBe(true);
    // placed on turn 1; alive through turns 1..5, gone from turn 6.
    sim.turn = 4;
    sim['sweepTraps']();
    expect(tileAt(map, 1, 0)!.trap).toMatchObject({ owner: 0 });
    sim.turn = 6;
    sim['sweepTraps']();
    expect(tileAt(map, 1, 0)!.trap).toBeNull();
  });

  it('a trap that fails to kill its victim leaves it standing but damaged', () => {
    tileAt(map, 1, 0)!.ownedBy = 0;
    const trapper = place(0, 'trapper', 0, 0);
    expect(sim.applyCommand({ type: 'trap', unitId: trapper.id, q: 1, r: 0 })).toBe(true);
    sim.currentPlayerIndex = 1;
    const tough = place(1, 'warrior', 0, 1, { hp: 200 }); // outlive the 90 damage
    expect(sim.applyCommand({ type: 'move', unitId: tough.id, q: 1, r: 0 })).toBe(true);
    expect(tileAt(map, 1, 0)!.unit?.hp).toBe(200 - trapDamage());
    expect(tileAt(map, 1, 0)!.trap).toBeNull();
  });
});