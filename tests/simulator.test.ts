import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { canAttack, canHeal, canMove } from '../src/game/units';
import { TileType } from '../src/game/tileTypes';

describe('Simulator commands', () => {
  it('move moves a unit, marks moved, emits unitMoved', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 1 });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 1)!.unit?.id).toBe('u1');
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect(tileAt(map, 0, 1)!.unit!.hasMoved).toBe(true);
    const events = sim.drainEvents();
    expect(events[0]).toMatchObject({ type: 'unitMoved', unitId: 'u1', to: { q: 0, r: 1 } });
  });

  it('rejects a move to an unreachable tile', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 });
    expect(ok).toBe(false);
  });

  it('allows a +1 move from the unit own road tile', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    tileAt(map, 0, 0)!.roadOwner = 0;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(true);
  });

  it('rejects the +1 move when the unit does not start on its own road', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    tileAt(map, 0, 0)!.roadOwner = 1;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(false);
  });

  it('a rider that attacked can still move its full range', () => {
    const map = makeTestMap(3);
    const rider = makeUnit('u1', 0, 'rider', 0, 0);
    rider.hasAttacked = true;
    tileAt(map, 0, 0)!.unit = rider;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(true);
    tileAt(map, 0, 2)!.unit = null;
    const second = makeUnit('u2', 0, 'rider', 0, 0);
    second.hasAttacked = true;
    tileAt(map, 0, 0)!.unit = second;
    expect(sim.applyCommand({ type: 'move', unitId: 'u2', q: 0, r: 3 })).toBe(true);
  });

  it('a rider that moved then attacked can move again (additional move)', () => {
    const map = makeTestMap(4);
    const rider = makeUnit('r1', 0, 'rider', 0, 0);
    rider.hasMoved = true;
    tileAt(map, 0, 0)!.unit = rider;
    tileAt(map, 1, 0)!.unit = makeUnit('e1', 1, 'warrior', 1, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'attack', unitId: 'r1', q: 1, r: 0 })).toBe(true);
    expect(rider.hasAttacked).toBe(true);
    expect(rider.hasMoved).toBe(false);
    expect(sim.applyCommand({ type: 'move', unitId: 'r1', q: -1, r: 0 })).toBe(true);
  });

  it('builds a temple, stamps bornTurn, and grows it every 2 turns to level 4', () => {    const map = makeTestMap(3);
    const water = tileAt(map, 1, 0)!;
    water.terrain = TileType.Water;
    water.ownedBy = 0;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = ['waterTemples'];
    players[0]!.resources = { wood: 0, stone: 10, money: 30, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'temple' })).toBe(true);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'temple', level: 1, bornTurn: 1 });

    const grown: number[] = [];
    const endRound = (): void => {
      expect(sim.applyCommand({ type: 'endTurn' })).toBe(true);
      for (const e of sim.drainEvents()) {
        if (e.type === 'templeGrown') grown.push(e.level);
      }
    };
    endRound(); // turn 2
    expect(tileAt(map, 1, 0)!.building!.level).toBe(1);
    endRound(); // turn 3
    expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
    endRound(); // turn 4
    expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
    endRound(); // turn 5
    expect(tileAt(map, 1, 0)!.building!.level).toBe(3);
    endRound(); // turn 6
    endRound(); // turn 7
    expect(tileAt(map, 1, 0)!.building!.level).toBe(4);
    endRound(); // turn 8
    endRound(); // turn 9
    expect(tileAt(map, 1, 0)!.building!.level).toBe(4);
    expect(grown).toEqual([2, 3, 4]);
  });

  it('grows a forest temple to level 4', () => {    const map = makeTestMap(3);
    const forest = tileAt(map, 1, 0)!;
    forest.terrain = TileType.GrasslandForest;
    forest.ownedBy = 0;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = ['forestTemple'];
    players[0]!.resources = { wood: 0, stone: 10, money: 30, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'forestTemple' })).toBe(true);
    expect(tileAt(map, 1, 0)!.building).toEqual({ kind: 'forestTemple', level: 1, bornTurn: 1 });
    for (let i = 0; i < 3; i++) {
      sim.applyCommand({ type: 'endTurn' });
      sim.drainEvents();
    }
    expect(tileAt(map, 1, 0)!.building!.level).toBe(2);
  });

  it('tracks kills, lost units, captures, and upgrades in player stats', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    tileAt(map, 0, 0)!.unit = makeUnit('me', 0, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.unit = makeUnit('enemy', 1, 'warrior', 1, 0);
    tileAt(map, 1, 0)!.unit!.hp = 2;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'attack', unitId: 'me', q: 1, r: 0 });
    expect(players[1]!.stats!.killedUnits).toBe(1);
    expect(players[0]!.kills).toBe(1);
    expect(players[0]!.stats!.pirateKills).toBe(0);
  });

  it('a shield that moved cannot attack, a shield that did not move can', () => {
    const map = makeTestMap();
    const defender = makeUnit('def', 1, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit = defender;
    const shield = makeUnit('sh', 0, 'shield', 0, 0);
    tileAt(map, 0, 0)!.unit = shield;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'attack', unitId: 'sh', q: 0, r: 1 })).toBe(true);
    sim.drainEvents();
    const moved = makeUnit('sh2', 0, 'shield', 0, 0);
    moved.hasMoved = true;
    tileAt(map, 0, 0)!.unit = moved;
    expect(sim.applyCommand({ type: 'attack', unitId: 'sh2', q: 0, r: 1 })).toBe(false);
  });

  it('attack applies damage, emits attack', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('att', 0, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.unit = makeUnit('def', 1, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 });
    expect(ok).toBe(true);
    const events = sim.drainEvents();
    const attack = events.find((e) => e.type === 'attack');
    expect(attack).toBeDefined();
    expect((attack as { attackerDamage: number }).attackerDamage).toBeGreaterThan(0);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBeLessThan(50);
  });

  it('spawn creates a unit owned by the current player and emits spawned', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources.money = 20;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'spawn', q: 0, r: 0, unitType: 'warrior' });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 0)!.unit?.owner).toBe(0);
    expect(players[0]!.resources.money).toBe(16);
    expect(sim.drainEvents()).toEqual([
      expect.objectContaining({ type: 'spawned', unitType: 'warrior', q: 0, r: 0, playerIndex: 0 }),
    ]);
  });

  it('capture changes village ownership and emits captured', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 1)!.settlement = { owner: 1, level: 1, captureReady: true };
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 2)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 2)!.ownedBy = 1;
    const cap = makeUnit('cap', 0, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit = cap;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'capture', q: 0, r: 1, unitId: 'cap' });
    expect(ok).toBe(true);
    expect(tileAt(map, 0, 1)!.settlement!.owner).toBe(0);
    expect(sim.drainEvents()).toEqual([
      expect.objectContaining({ type: 'scoreFly', playerIndex: 0, amount: 50 }),
      expect.objectContaining({ type: 'captured', q: 0, r: 1, oldOwner: 1, newOwner: 0, ownerDied: false }),
    ]);
  });

  it('a unit can dock only on its own port', () => {
    const map = makeTestMap();
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.building = { kind: 'port', level: 1 };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = ['navigation'];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 1, r: 0 })).toBe(false);
    tileAt(map, 1, 0)!.ownedBy = 1;
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 1, r: 0 })).toBe(false);
    tileAt(map, 1, 0)!.ownedBy = 0;
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 1, r: 0 })).toBe(true);
    const unit = tileAt(map, 1, 0)!.unit!;
    expect(unit.shipLevel).toBe(1);
  });

  it('a unit that turns into a ship cannot move or attack this turn', () => {
    const map = makeTestMap();
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 1, 0)!.building = { kind: 'port', level: 1 };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = ['navigation'];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 1, r: 0 })).toBe(true);
    const unit = tileAt(map, 1, 0)!.unit!;
    expect(unit.hasMoved).toBe(true);
    expect(unit.hasAttacked).toBe(true);
    expect(canMove(unit)).toBe(false);
    expect(canAttack(unit)).toBe(false);
  });

  it('a ship that lands consumes its whole turn: it cannot move, attack, or heal', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    const unit = makeUnit('u1', 0, 'warrior', 0, 0);
    unit.shipLevel = 1;
    tileAt(map, 0, 0)!.unit = unit;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'shipLanding', unitId: 'u1', q: 0, r: 1 })).toBe(true);
    const landed = tileAt(map, 0, 1)!.unit!;
    expect(landed.shipLevel).toBeUndefined();
    expect(landed.hasLanded).toBe(true);
    expect(canMove(landed)).toBe(false);
    expect(canAttack(landed)).toBe(false);
    expect(canHeal(landed)).toBe(false);
    expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(false);
  });

  it('a shield ship may attack after moving, and a rider ship may not move after attacking', () => {
    const map = makeTestMap();
    for (const t of map.tiles) t.terrain = TileType.Water;
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.terrain = TileType.Water;

    // Shield ship sails and attacks in the same turn.
    const shield = makeUnit('sh', 0, 'shield', 0, 0);
    shield.shipLevel = 1;
    tileAt(map, 0, 0)!.unit = shield;
    tileAt(map, 2, 0)!.unit = makeUnit('e1', 1, 'warrior', 2, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.99 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'move', unitId: 'sh', q: 1, r: 0 })).toBe(true);
    expect(sim.applyCommand({ type: 'attack', unitId: 'sh', q: 2, r: 0 })).toBe(true);
    expect(shield.hasAttacked).toBe(true);
    expect(canMove(shield)).toBe(false);

    // A rider ship that attacked cannot move again.
    tileAt(map, 1, 0)!.unit = null;
    tileAt(map, 0, 0)!.unit = null;
    const rider = makeUnit('rd', 0, 'rider', 0, 0);
    rider.shipLevel = 1;
    rider.attackDistance = 2;
    tileAt(map, 0, 0)!.unit = rider;
    const sim2 = new Simulator(map, players, 'capture', { rng: () => 0.99 });
    sim2.startGame();
    sim2.drainEvents();
    expect(sim2.applyCommand({ type: 'attack', unitId: 'rd', q: 2, r: 0 })).toBe(true);
    expect(canMove(rider)).toBe(false);
    expect(sim2.applyCommand({ type: 'move', unitId: 'rd', q: 1, r: 0 })).toBe(false);
  });
});

describe('knight bloodlust and combos', () => {
  function setup(enemies: { q: number; r: number; type: 'warrior' | 'swordsman'; hp?: number }[]) {
    const map = makeTestMap(4);
    for (const t of map.tiles) t.unit = null;
    const knight = makeUnit('k1', 0, 'knight', 0, 0);
    tileAt(map, 0, 0)!.unit = knight;
    for (const e of enemies) {
      const enemy = makeUnit(`e${e.q}${e.r}`, 1, e.type, e.q, e.r);
      if (e.hp !== undefined) enemy.hp = e.hp;
      tileAt(map, e.q, e.r)!.unit = enemy;
    }
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    return { map, sim, knight };
  }

  it('may attack again after each kill, and stops after a non-kill attack', () => {
    const { map, sim, knight } = setup([
      { q: 1, r: 0, type: 'warrior', hp: 1 },
      { q: 2, r: 0, type: 'swordsman', hp: 50 },
    ]);
    expect(sim.applyCommand({ type: 'attack', unitId: 'k1', q: 1, r: 0 })).toBe(true);
    expect(knight.hasAttacked).toBe(true);
    expect(canAttack(knight)).toBe(true); // next enemy is in range after the advance
    expect(sim.applyCommand({ type: 'attack', unitId: 'k1', q: 2, r: 0 })).toBe(true);
    // Swordsman survived (8 hp vs 5 damage): no extra attack remains.
    expect(knight.canExtraAttack).toBe(false);
    expect(canAttack(knight)).toBe(false);
    expect(sim.applyCommand({ type: 'attack', unitId: 'k1', q: 2, r: 0 })).toBe(false);
  });

  it('awards a 30-point combo bonus at the third kill in one turn', () => {
    const { map, sim, knight } = setup([
      { q: 1, r: 0, type: 'warrior', hp: 1 },
      { q: 2, r: 0, type: 'warrior', hp: 1 },
      { q: 3, r: 0, type: 'warrior', hp: 1 },
    ]);
    sim.applyCommand({ type: 'attack', unitId: 'k1', q: 1, r: 0 });
    sim.applyCommand({ type: 'attack', unitId: 'k1', q: 2, r: 0 });
    expect(knight.killsThisTurn).toBe(2);
    expect(sim.applyCommand({ type: 'attack', unitId: 'k1', q: 3, r: 0 })).toBe(true);
    expect(knight.killsThisTurn).toBe(3);
    const events = sim.drainEvents();
    const combo = events.find((e) => e.type === 'knightCombo');
    expect(combo).toMatchObject({ type: 'knightCombo', unitId: 'k1', q: 3, r: 0, playerIndex: 0 });
    expect(sim.players[0]!.score).toBe(3 * 25 + 30);
  });

  it('a knight aboard a ship does not chain attacks', () => {
    const map = makeTestMap(4);
    for (const t of map.tiles) t.unit = null;
    const knight = makeUnit('k1', 0, 'knight', 0, 0);
    knight.shipLevel = 1;
    knight.hp = 5;
    tileAt(map, 0, 0)!.unit = knight;
    const enemy = makeUnit('e1', 1, 'warrior', 2, 0);
    enemy.hp = 1;
    tileAt(map, 2, 0)!.unit = enemy;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'attack', unitId: 'k1', q: 2, r: 0 })).toBe(true);
    expect(knight.canExtraAttack).toBeFalsy();
    expect(canAttack(knight)).toBe(false);
  });
});

describe('science miss chance in the simulator', () => {
  function setup(hasScience: boolean): { sim: Simulator; map: ReturnType<typeof makeTestMap> } {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.unit = makeUnit('att', 0, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.unit = makeUnit('def', 1, 'warrior', 0, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    if (hasScience) players[0]!.skills.push('science');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.08 });
    sim.startGame();
    sim.drainEvents();
    return { sim, map };
  }

  it('without science a 0.08 attack roll misses', () => {
    const { sim } = setup(false);
    expect(sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 })).toBe(true);
    const attack = sim.drainEvents().find((e) => e.type === 'attack');
    expect((attack as { missed: boolean }).missed).toBe(true);
  });

  it('with science the same 0.08 attack roll hits', () => {
    const { sim, map } = setup(true);
    expect(sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 1 })).toBe(true);
    const attack = sim.drainEvents().find((e) => e.type === 'attack');
    expect((attack as { missed: boolean }).missed).toBe(false);
    expect(tileAt(map, 0, 1)!.unit!.hp).toBe(30);
  });
});

describe('build bridge command', () => {
  it('builds a bridge over a water gap and emits bridgeBuilt', () => {
    const map = makeTestMap();
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills.push('bridges');
    players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'buildBridge', q: 1, r: 0 })).toBe(true);
    expect(tileAt(map, 1, 0)!.bridge).toEqual({ owner: 0, dir: 'we' });
    expect(tileAt(map, 1, 0)!.roadOwner).toBe(0);
    expect(sim.drainEvents()).toEqual([
      expect.objectContaining({ type: 'bridgeBuilt', q: 1, r: 0, playerIndex: 0 }),
    ]);
  });

  it('rejects a bridge command without the skill', () => {
    const map = makeTestMap();
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: 'buildBridge', q: 1, r: 0 })).toBe(false);
  });
});
