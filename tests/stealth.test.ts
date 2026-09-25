import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Unit } from '../src/game/units';

function freshCatsSim() {
  const map = makeTestMap();
  const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
  players[0]!.tribe = Tribe.Cats;
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function freshTwoPlayerSim() {
  const map = makeTestMap(4);
  const players = buildPlayers(Tribe.Cats, 2, new SeededRandom(1));
  const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
  players[0]!.tribe = Tribe.Cats;
  sim.startGame();
  sim.drainEvents();
  return sim;
}

function villageAt(sim: Simulator, q: number, r: number, owner: number | null): void {
  tileAt(sim.map, q, r)!.settlement = { owner, level: 1, captureReady: false, name: `Village ${q},${r}` };
}

function placeIn(sim: Simulator, owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('u' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(sim.map, q, r)!.unit = u;
  return u;
}

let sim: ReturnType<typeof freshCatsSim>;

beforeEach(() => {
  sim = freshCatsSim();
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('u' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(sim.map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  const t = sim.map.tiles.find((x) => x.unit?.id === id)!;
  return t.unit!;
}

describe('stalker stealth', () => {
  it('first move after spawn enables stealth before the walk', () => {
    const stalker = place(0, 'stalker', 0, 0);
    const ok = sim.applyCommand({ type: 'move', unitId: stalker.id, q: 0, r: 1 });
    expect(ok).toBe(true);
    const moved = findUnit(stalker.id);
    expect(moved.q).toBe(0);
    expect(moved.r).toBe(1);
    expect(moved.isStealthed).toBe(true);
    expect(moved.firstMoveStealthDone).toBe(true);
  });

  it('enable stealth consumes all actions', () => {
    const stalker = place(0, 'stalker', 0, 0);
    expect(sim.applyCommand({ type: 'enableStealth', unitId: stalker.id })).toBe(true);
    const s = findUnit(stalker.id);
    expect(s.isStealthed).toBe(true);
    expect(s.hasMoved).toBe(true);
    expect(s.hasAttacked).toBe(true);
    expect(s.hasHealed).toBe(true);
  });

  it('enable stealth is refused when already stealthed', () => {
    const stalker = place(0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true, hasMoved: true, hasAttacked: true, hasHealed: true });
    expect(sim.applyCommand({ type: 'enableStealth', unitId: stalker.id })).toBe(false);
    const s = findUnit(stalker.id);
    expect(s.isStealthed).toBe(true);
  });

  it('an enemy try to move onto a hidden stalker reveals it and keeps the move on a first-step collision', () => {
    sim.currentPlayerIndex = 1;
    const enemy = place(1, 'warrior', 0, 0);
    place(0, 'stalker', 1, 0, { isStealthed: true, firstMoveStealthDone: true });
    // the hidden stalker is the enemy's adjacent move target: the move is
    // cancelled before the first step and the enemy keeps its move action
    expect(sim.applyCommand({ type: 'move', unitId: enemy.id, q: 1, r: 0 })).toBe(true);
    const e = findUnit(enemy.id);
    expect(e.q).toBe(0);
    expect(e.r).toBe(0); // never moved
    expect(e.hasMoved).toBe(false); // may move again
    const stalker = sim.map.tiles.find((t) => t.unit?.type === 'stalker')!.unit!;
    expect(stalker.isStealthed).toBe(false); // revealed
  });

  it('an enemy move path stops one cell before a hidden stalker mid-path, move consumed', () => {
    sim.currentPlayerIndex = 1;
    const enemy = place(1, 'rider', 0, 0);
    place(0, 'stalker', 2, 0, { isStealthed: true, firstMoveStealthDone: true });
    // rider (40 move) heads through (1,0) to (2,0): the hidden stalker is at (2,0),
    // so the rider stops at (1,0)
    expect(sim.applyCommand({ type: 'move', unitId: enemy.id, q: 2, r: 0 })).toBe(true);
    const e = findUnit(enemy.id);
    expect(e.q).toBe(1);
    expect(e.r).toBe(0);
    expect(e.hasMoved).toBe(true);
    const stalker = sim.map.tiles.find((t) => t.unit?.type === 'stalker')!.unit!;
    expect(stalker.isStealthed).toBe(false);
  });

  it('attacking from stealth reveals the stalker', () => {
    sim.currentPlayerIndex = 0;
    const stalker = place(0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true });
    place(1, 'warrior', 1, 0);
    expect(sim.applyCommand({ type: 'attack', unitId: stalker.id, q: 1, r: 0 })).toBe(true);
    const s = findUnit(stalker.id);
    expect(s.isStealthed).toBe(false);
  });

  it('emits stealth events', () => {
    const stalker = place(0, 'stalker', 0, 0);
    sim.applyCommand({ type: 'enableStealth', unitId: stalker.id });
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'stealthEnabled')).toBe(true);
  });
});

describe('stalker village stealth', () => {
  it('a stealthed stalker cannot move onto an enemy village cell', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, 1);
    const st = placeIn(s, 0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true });
    expect(s.applyCommand({ type: 'move', unitId: st.id, q: 2, r: 0 })).toBe(false);
    expect(tileAt(s.map, 0, 0)!.unit).toBe(st);
    expect(tileAt(s.map, 2, 0)!.unit).toBeNull();
  });

  it('a fresh stalker cannot target an enemy village cell on its first move', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, 1);
    const st = placeIn(s, 0, 'stalker', 0, 0);
    expect(s.applyCommand({ type: 'move', unitId: st.id, q: 2, r: 0 })).toBe(false);
    expect(tileAt(s.map, 2, 0)!.unit).toBeNull();
    // beside the village is fine: auto-stealth is applied, then the village spots it
    expect(s.applyCommand({ type: 'move', unitId: st.id, q: 1, r: 0 })).toBe(true);
    const moved = tileAt(s.map, 1, 0)!.unit!;
    expect(moved.isStealthed).toBe(false);
  });

  it('moving beside an enemy village reveals the stalker and notifies', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, 1);
    const st = placeIn(s, 0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true });
    expect(s.applyCommand({ type: 'move', unitId: st.id, q: 1, r: 0 })).toBe(true);
    const moved = tileAt(s.map, 1, 0)!.unit!;
    expect(moved.isStealthed).toBe(false);
    const events = s.drainEvents();
    const spotted = events.find((e) => e.type === 'stalkerSpotted');
    expect(spotted).toBeDefined();
    expect(spotted).toMatchObject({ villageQ: 2, villageR: 0 });
  });

  it('free and own villages never reveal a stealthed stalker', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, null); // free
    const st = placeIn(s, 0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true });
    expect(s.applyCommand({ type: 'move', unitId: st.id, q: 1, r: 0 })).toBe(true);
    expect(tileAt(s.map, 1, 0)!.unit!.isStealthed).toBe(true);
    expect(s.drainEvents().some((e) => e.type === 'stalkerSpotted')).toBe(false);

    const s2 = freshTwoPlayerSim();
    villageAt(s2, 2, 0, 0); // own
    const st2 = placeIn(s2, 0, 'stalker', 0, 0, { isStealthed: true, firstMoveStealthDone: true });
    expect(s2.applyCommand({ type: 'move', unitId: st2.id, q: 1, r: 0 })).toBe(true);
    expect(tileAt(s2.map, 1, 0)!.unit!.isStealthed).toBe(true);
    expect(s2.drainEvents().some((e) => e.type === 'stalkerSpotted')).toBe(false);
  });

  it('enable stealth is refused beside an enemy village', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, 1);
    const st = placeIn(s, 0, 'stalker', 1, 0);
    expect(s.applyCommand({ type: 'enableStealth', unitId: st.id })).toBe(false);
    expect(st.isStealthed).toBeUndefined();
  });

  it('capturing a free village beside a stealthed stalker reveals it instantly', () => {
    const s = freshTwoPlayerSim();
    villageAt(s, 2, 0, null);
    const st = placeIn(s, 0, 'stalker', 1, 0, { isStealthed: true, firstMoveStealthDone: true });
    const enemy = placeIn(s, 1, 'warrior', 2, 0);
    const village = tileAt(s.map, 2, 0)!;
    village.settlement!.captureReady = true;
    s.currentPlayerIndex = 1;
    expect(s.applyCommand({ type: 'capture', q: 2, r: 0, unitId: enemy.id })).toBe(true);
    expect(st.isStealthed).toBe(false);
    expect(s.drainEvents().some((e) => e.type === 'stalkerSpotted')).toBe(true);
  });
});