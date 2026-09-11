import { describe, it, expect } from 'vitest';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { makeUnit } from '../src/game/units';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';
import { Tribe } from '../src/game/tribes';
import {
  BOTTLE_SPAWN_TURNS,
  BOTTLE_SPAWN_PROBABILITY,
  bottleCollectableFor,
  collectExpiredBottles,
  spawnCandidates,
  touchBottle,
  trySpawnBottle,
} from '../src/game/bottles';

function tile(q: number, r: number, terrain: TileType, ownedBy: number | null = null, opts: { building?: MapTile['building']; bridge?: boolean; unit?: MapTile['unit'] } = {}): MapTile {
  const t: MapTile = {
    q, r, terrain,
    settlement: null,
    building: opts.building ?? null,
    unit: opts.unit ?? null,
    ownedBy,
    claimedByVillage: null,
    roadOwner: null,
    exploredBy: [0],
  };
  if (opts.bridge) t.bridge = { owner: 0, dir: 'we' };
  return t;
}

function water(q: number, r: number, ownedBy: number | null = null, opts: { building?: MapTile['building']; bridge?: boolean; unit?: MapTile['unit'] } = {}): MapTile {
  return tile(q, r, TileType.Water, ownedBy, opts);
}

function mapWith(tiles: MapTile[]): GameMap {
  return { radius: 4, spawns: [], tiles };
}

function ship(owner: number, q: number, r: number, opts: { hasMoved?: boolean; hasAttacked?: boolean; hasHealed?: boolean } = {}): MapTile['unit'] {
  return makeUnit(owner, 'warrior', q, r, { shipLevel: 2, hasMoved: opts.hasMoved ?? false, hasAttacked: opts.hasAttacked ?? false, hasHealed: opts.hasHealed ?? false });
}

describe('bottle spawning', () => {
  it('spawns a bottle on a random free non-owned water hex', () => {
    const map = mapWith([
      water(0, 0),
      water(1, 0),
      water(2, 0, 1),
      tile(3, 0, TileType.GrasslandLand),
    ]);
    expect(trySpawnBottle(map, BOTTLE_SPAWN_TURNS, () => 0)).toBe(true);
    const bottles = map.tiles.filter((t) => t.bottle);
    expect(bottles.length).toBe(1);
    expect(bottles[0]!.ownedBy).toBeNull();
    expect(bottles[0]!.building).toBeNull();
    expect(bottles[0]!.bottle).toEqual({ bornTurn: BOTTLE_SPAWN_TURNS, arrivalTurn: 0 });
  });

  it('does not spawn when the turn is not a multiple of the spawn interval', () => {
    const map = mapWith([water(0, 0)]);
    expect(trySpawnBottle(map, BOTTLE_SPAWN_TURNS + 1, () => 0)).toBe(false);
    expect(map.tiles[0]!.bottle).toBeUndefined();
  });

  it('does not spawn when the probability roll fails', () => {
    const map = mapWith([water(0, 0)]);
    expect(trySpawnBottle(map, BOTTLE_SPAWN_TURNS, () => BOTTLE_SPAWN_PROBABILITY + 0.1)).toBe(false);
    expect(map.tiles[0]!.bottle).toBeUndefined();
  });

  it('ignores owned water, land, buildings, bridges and occupied hexes', () => {
    const map = mapWith([
      water(0, 0, 1),
      tile(1, 0, TileType.GrasslandLand),
      water(2, 0, null, { building: { kind: 'port', level: 1 } }),
      water(3, 0, null, { bridge: true }),
      water(4, 0, null, { unit: ship(0, 4, 0) }),
    ]);
    expect(spawnCandidates(map).length).toBe(0);
    expect(trySpawnBottle(map, BOTTLE_SPAWN_TURNS, () => 0)).toBe(false);
  });

  it('lets several bottles coexist', () => {
    const map = mapWith([water(0, 0), water(1, 0), water(2, 0)]);
    trySpawnBottle(map, BOTTLE_SPAWN_TURNS, () => 0);
    trySpawnBottle(map, BOTTLE_SPAWN_TURNS * 2, () => 0);
    trySpawnBottle(map, BOTTLE_SPAWN_TURNS * 3, () => 0);
    expect(map.tiles.filter((t) => t.bottle).length).toBe(3);
  });
});

describe('bottle expiry', () => {
  it('removes a bottle after 5 turns', () => {
    const map = mapWith([
      water(0, 0),
      water(1, 0),
      water(2, 0),
    ]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 0 };
    map.tiles[1]!.bottle = { bornTurn: 5, arrivalTurn: 0 };
    const expired = collectExpiredBottles(map, 9);
    expect(expired.map((t) => axialOf(t))).toEqual(['0,0']);
    expect(map.tiles[0]!.bottle).toBeUndefined();
    expect(map.tiles[1]!.bottle).toBeDefined();
  });

  it('keeps a bottle alive at exactly 5 turns', () => {
    const map = mapWith([water(0, 0)]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 0 };
    expect(collectExpiredBottles(map, 8).length).toBe(0);
    expect(map.tiles[0]!.bottle).toBeDefined();
  });
});

describe('bottle collection', () => {
  it('records the arrival turn when a unit moves onto the bottle', () => {
    const t = water(1, 0);
    t.bottle = { bornTurn: 3, arrivalTurn: 0 };
    touchBottle(t, 7);
    expect(t.bottle!.arrivalTurn).toBe(7);
  });

  it('is collectable on the next turn when a ship stands on it', () => {
    const map = mapWith([
      water(1, 0, null, { unit: ship(0, 1, 0) }),
    ]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    expect(bottleCollectableFor(map, 0, 8).map((t) => t.q)).toEqual([1]);
  });

  it('is not collectable the same turn the ship landed', () => {
    const map = mapWith([water(1, 0, null, { unit: ship(0, 1, 0) })]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 8 };
    expect(bottleCollectableFor(map, 0, 8)).toEqual([]);
  });

  it('is not collectable by a land unit or another player', () => {
    const land = tile(1, 0, TileType.GrasslandLand, null, {
      unit: makeUnit(0, 'warrior', 1, 0),
    });
    land.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const other = mapWith([
      water(1, 0, null, { unit: ship(1, 1, 0) }),
    ]);
    other.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    expect(bottleCollectableFor(mapWith([land]), 0, 8)).toEqual([]);
    expect(bottleCollectableFor(other, 0, 8)).toEqual([]);
  });

  it('is not collectable by a ship that has exhausted its turn', () => {
    const exhausted = mapWith([
      water(1, 0, null, { unit: ship(0, 1, 0, { hasMoved: true, hasAttacked: true, hasHealed: true }) }),
    ]);
    exhausted.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    expect(bottleCollectableFor(exhausted, 0, 8)).toEqual([]);
  });
});

function axialOf(t: MapTile): string {
  return `${t.q},${t.r}`;
}

describe('bottles in the simulator', () => {
  function simWith(map: GameMap, playerCount = 1, rng: () => number = () => 0): Simulator {
    const enemies = Math.max(1, playerCount - 1);
    const players = buildPlayers(Tribe.Villagers, enemies, new SeededRandom(1));
    while (players.length > playerCount) players.pop();
    return new Simulator(map, players, 'capture', { rng, disablePirates: true });
  }

it('floats a bottle in each spawn interval turn when the roll wins', () => {
    const map = mapWith([water(0, 0), water(1, 0), water(2, 0)]);
    const sim = simWith(map);
    sim.startGame();
    sim.drainEvents();
    // advancing 2 rounds lands on the first spawn-interval turn.
    for (let i = 0; i < BOTTLE_SPAWN_TURNS; i++) sim.applyCommand({ type: 'endTurn' });
    const afterFirst = map.tiles.filter((t) => t.bottle);
    expect(afterFirst.length).toBe(1);
    expect(afterFirst[0]!.bottle!.bornTurn).toBe(BOTTLE_SPAWN_TURNS);
    // one more full interval passes.
    for (let i = 0; i < BOTTLE_SPAWN_TURNS; i++) sim.applyCommand({ type: 'endTurn' });
    const afterSecond = map.tiles.filter((t) => t.bottle);
    expect(afterSecond.length).toBe(Math.floor((BOTTLE_SPAWN_TURNS * 2) / BOTTLE_SPAWN_TURNS));
  });

  it('does not float a bottle in when the roll fails', () => {
    const map = mapWith([water(0, 0), water(1, 0)]);
    const sim = simWith(map, 1, () => 0.5);
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    sim.applyCommand({ type: 'endTurn' });
    expect(map.tiles.filter((t) => t.bottle).length).toBe(0);
  });

  it('sweeps bottles that lived longer than 5 turns', () => {
    const tiles = [water(0, 0, null), water(1, 0, 1), water(2, 0, 1)];
    tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 0 };
    const map = mapWith(tiles);
    const sim = simWith(map, 1, () => 0.5);
    sim.startGame();
    sim.drainEvents();
    // Advance so the bornTurn 3 bottle is now >5 turns old (turn 9).
    for (let i = 0; i < 8; i++) sim.applyCommand({ type: 'endTurn' });
    expect(tiles[0]!.bottle).toBeUndefined();
  });

  it('collects a bottle with the getBottle command, consuming the ship turn', () => {
    const map = mapWith([
      water(1, 0, null, { unit: ship(0, 1, 0) }),
      water(0, 0),
    ]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map);
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    const ok = sim.applyCommand({ type: 'getBottle' });
    expect(ok).toBe(true);
    expect(map.tiles[0]!.bottle).toBeUndefined();
    const unit = map.tiles[0]!.unit!;
    expect(unit.hasMoved).toBe(true);
    expect(unit.hasAttacked).toBe(true);
    expect(unit.hasHealed).toBe(true);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'bottleCollected' && e.kind === 'money')).toBe(true);
  });

  it('grants 50 money for a money bottle', () => {
    const map = mapWith([water(1, 0, null, { unit: ship(0, 1, 0) })]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map);
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    const before = sim.players[0]!.resources.money;
    sim.applyCommand({ type: 'getBottle' });
    expect(sim.players[0]!.resources.money).toBe(before + 50);
  });

  it('heals the ship for a heal bottle', () => {
    const map = mapWith([water(1, 0, null, { unit: ship(0, 1, 0) })]);
    map.tiles[0]!.unit!.hp = 30;
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map, 1, () => 0.9); // heal roll
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'getBottle' });
    expect(map.tiles[0]!.unit!.hp).toBe(50);
  });

  it('opens a random unopened skill for a skill bottle', () => {
    const map = mapWith([water(1, 0, null, { unit: ship(0, 1, 0) })]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map, 1, (() => {
      let calls = 0;
      return () => (calls++ === 0 ? 0.5 : 0);
    })());
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'getBottle' });
    expect(sim.players[0]!.skills.length).toBe(1);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'bottleCollected' && e.kind === 'skill')).toBe(true);
  });

  it('does not collect a bottle the ship already exhausted', () => {
    const map = mapWith([
      water(1, 0, null, { unit: ship(0, 1, 0, { hasMoved: true, hasAttacked: true, hasHealed: true }) }),
    ]);
    map.tiles[0]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map);
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    const before = sim.players[0]!.resources.money;
    expect(sim.applyCommand({ type: 'getBottle' })).toBe(false);
    expect(sim.players[0]!.resources.money).toBe(before);
    expect(map.tiles[0]!.bottle).toBeDefined();
  });

  it('AI ships collect bottles at the start of their turn', () => {
    const map = mapWith([
      water(0, 0),
      water(2, 0),
      water(1, 0, null, { unit: ship(1, 1, 0) }),
    ]);
    map.tiles[2]!.bottle = { bornTurn: 3, arrivalTurn: 7 };
    const sim = simWith(map, 2, () => 0);
    sim.turn = 8;
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' }); // player 0 -> AI player 1 acts
    expect(map.tiles[2]!.bottle).toBeUndefined();
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'bottleCollected' && e.playerIndex === 1 && e.kind === 'money')).toBe(true);
  });
});
