import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Unit } from '../src/game/units';

function freshSandSim(rng: () => number = () => 0.5) {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Sand, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Sand;
  const sim = new Simulator(map, players, 'turns30', { rng });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  const s = freshSandSim();
  sim = s.sim;
  map = s.map;
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('s' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  return sim.map.tiles.find((t) => t.unit?.id === id)!.unit!;
}

describe('stunner stun', () => {
  it('a successful stun at range 2 applies no damage and sets stunTurns', () => {
    const stunner = place(0, 'stunner', 0, 0);
    const target = place(1, 'warrior', 2, 0);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(true);
    const t = findUnit(target.id);
    expect(t.stunTurns).toBe(2); // has not acted this round
    expect(t.hp).toBe(50); // no damage
    expect(sim.drainEvents().some((e) => e.type === 'stunShot' && !e.missed)).toBe(true);
  });

  it('a stunner cannot stun twice in a turn', () => {
    const stunner = place(0, 'stunner', 0, 0);
    place(1, 'warrior', 2, 0);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(true);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(false);
  });

  it('a miss applies no stun', () => {
    const s = freshSandSim(() => 0); // always miss (0 < missChance 0.1)
    sim = s.sim;
    map = s.map;
    const stunner = place(0, 'stunner', 0, 0);
    const target = place(1, 'warrior', 2, 0);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(true);
    expect(findUnit(target.id).stunTurns).toBeUndefined();
    expect(findUnit(stunner.id).hasAttacked).toBe(true);
  });

  it('a stunned unit cannot act on its next turn and the counter decrements', () => {
    const stunner = place(0, 'stunner', 0, 0);
    const target = place(1, 'warrior', 2, 0);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(true);
    // move to the enemy's turn: it is stunned (canMove false), counter drops 2->1
    sim.currentPlayerIndex = 1;
    sim['decrementStunsFor'](1);
    const t = findUnit(target.id);
    expect(t.stunTurns).toBe(1);
    expect(t.hasMoved).toBe(false);
    // canMove() is false while stunned, so the command is refused
    expect(sim.applyCommand({ type: 'move', unitId: target.id, q: 3, r: 0 })).toBe(false);
    // next round: 1->0, stun wears off
    sim['decrementStunsFor'](1);
    expect(findUnit(target.id).stunTurns).toBe(0);
    expect(sim.applyCommand({ type: 'move', unitId: target.id, q: 3, r: 0 })).toBe(true);
  });

  it('a stun refuses friendly targets and out-of-range tiles', () => {
    const stunner = place(0, 'stunner', 0, 0);
    const ally = place(0, 'warrior', 2, 0);
    expect(sim.applyCommand({ type: 'stun', unitId: stunner.id, q: 2, r: 0 })).toBe(false);
    expect(findUnit(ally.id).stunTurns).toBeUndefined();
  });
});