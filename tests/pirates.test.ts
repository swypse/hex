import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { hexDistance, hexNeighbors } from '../src/game/hex';
import { TileType, isWaterType } from '../src/game/tileTypes';
import { PIRATE_HP, PIRATE_OWNER, type Unit } from '../src/game/units';

function makeWaterMap(radius = 2): ReturnType<typeof makeTestMap> {
  const map = makeTestMap(radius);
  for (const t of map.tiles) {
    if (hexDistance({ q: 0, r: 0 }, t) === radius) t.terrain = TileType.Water;
  }
  return map;
}

function makePirate(id: string, q: number, r: number): Unit {
  return {
    id,
    owner: PIRATE_OWNER,
    type: 'pirate',
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: PIRATE_HP,
    attack: 30,
    attackDistance: 3,
    defence: 10,
    spawnVillage: null,
  };
}

function makeShip(id: string, owner: number, q: number, r: number): Unit {
  const ship = makeUnit(id, owner, 'warrior', q, r);
  ship.shipLevel = 1;
  return ship;
}

describe('Pirates', () => {
  it('spawn on edge water cells only after turn 5, every second turn', () => {
    const map = makeWaterMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0 });
    sim.startGame();
    sim.drainEvents();

    for (let i = 0; i < 6; i++) {
      sim.applyCommand({ type: 'endTurn' });
      sim.drainEvents();
    }
    expect(sim.turn).toBe(7);
    expect(map.tiles.filter((t) => t.unit?.type === 'pirate')).toHaveLength(0);

    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    const pirates = map.tiles.filter((t) => t.unit?.type === 'pirate');
    expect(pirates).toHaveLength(1);
    expect(pirates[0]!.unit!.owner).toBe(PIRATE_OWNER);
    expect(hexDistance({ q: 0, r: 0 }, pirates[0]!)).toBe(map.radius);
    expect(events.some((e) => e.type === 'pirateSpawned')).toBe(true);
  });

  it('a failed capture attempt damages both the pirate and the ship without stealing money', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 0, 1);
    tileAt(map, 0, 1)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.resources.money = 100;
    const before = players[0]!.resources.money;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(players[0]!.resources.money).toBe(before);
    expect(pirate.hp).toBe(PIRATE_HP - 20);
    expect(ship.hp).toBe(50 - 10);
    expect(events.some((e) => e.type === 'pirateCapture' && (e as { success: boolean }).success === false)).toBe(true);
  });

  it('a successful capture converts the ship into a pirate ship keeping its hp', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 0, 1);
    tileAt(map, 0, 1)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.1 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    sim.drainEvents();
    expect(ship.type).toBe('pirate');
    expect(ship.owner).toBe(PIRATE_OWNER);
    expect(ship.hp).toBe(50);
    expect(ship.shipLevel).toBe(1);
  });

  it('take their turn after all players and try to capture the nearest ship', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 0, 1);
    tileAt(map, 0, 1)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    const captureIdx = events.findIndex((e) => e.type === 'pirateCapture');
    const turnIdx = events.findIndex((e) => e.type === 'turnStarted');
    expect(captureIdx).toBeGreaterThan(-1);
    expect(turnIdx).toBeGreaterThan(captureIdx);
  });

  it('attack units on land within range', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 0)!.unit = makePirate('pirate-1', 0, 0);
    const defender = makeUnit('guard', 0, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit = defender;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    sim.drainEvents();
    expect(defender.hp).toBe(20);
    expect(tileAt(map, 0, 0)!.unit!.hp).toBe(140);
  });

  it('does not step onto the land tile of a unit it kills', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const defender = makeUnit('guard', 0, 'warrior', 0, 1);
    defender.hp = 1;
    tileAt(map, 0, 1)!.unit = defender;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    sim.drainEvents();
    expect(tileAt(map, 0, 1)!.unit).toBeNull();
    expect(tileAt(map, 0, 0)!.unit).toBe(pirate);
  });

  it('counter-attack land units that attack them', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 0)!.unit = makePirate('pirate-1', 0, 0);
    const attacker = makeUnit('att', 0, 'warrior', 0, 1);
    tileAt(map, 0, 1)!.unit = attacker;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    const ok = sim.applyCommand({ type: 'attack', unitId: 'att', q: 0, r: 0 });
    expect(ok).toBe(true);
    sim.drainEvents();
    expect(attacker.hp).toBe(22);
    expect(tileAt(map, 0, 0)!.unit!.hp).toBe(140);
  });

  it('move toward the nearest player unit over sea when it is out of range', () => {
    const map = makeTestMap(4);
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    tileAt(map, 0, 2)!.terrain = TileType.Water;
    tileAt(map, 0, 3)!.terrain = TileType.Water;
    tileAt(map, 0, 4)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 0, 4);
    tileAt(map, 0, 4)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(pirate.q).toBe(0);
    expect(pirate.r).toBe(3);
    expect(events.some((e) => e.type === 'unitMoved' && (e as { unitId: string }).unitId === 'pirate-1')).toBe(true);
  });

  it('moves in a random direction at max distance when no player unit exists', () => {
    const map = makeTestMap(2);
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    for (const n of hexNeighbors({ q: 0, r: 0 })) {
      const t = tileAt(map, n.q, n.r);
      if (t) t.terrain = TileType.Water;
    }
    const pirate = makePirate('pirate-1', 0, 0);
    tileAt(map, 0, 0)!.unit = pirate;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(pirate.q !== 0 || pirate.r !== 0).toBe(true);
    expect(isWaterType(tileAt(map, pirate.q, pirate.r)!.terrain)).toBe(true);
    expect(events.some((e) => e.type === 'unitMoved' && (e as { unitId: string }).unitId === 'pirate-1')).toBe(true);
  });

  it('award 30 points to the player who kills a pirate', () => {
    const map = makeTestMap();
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    const pirate = makePirate('pirate-1', 0, 0);
    pirate.hp = 1;
    tileAt(map, 0, 0)!.unit = pirate;
    const ship = makeShip('ship-1', 0, 1, 0);
    tileAt(map, 1, 0)!.unit = ship;

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    const ok = sim.applyCommand({ type: 'attack', unitId: 'ship-1', q: 0, r: 0 });
    expect(ok).toBe(true);
    const events = sim.drainEvents();
    expect(tileAt(map, 0, 0)!.unit).toBeNull();
    expect(players[0]!.score).toBe(30);
    expect(events.some((e) => e.type === 'scoreFly' && e.amount === 30)).toBe(true);
  });
});
