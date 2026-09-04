import { describe, it, expect, vi, afterEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { knownTribesFor, territoryColor, UNKNOWN_TRIBE_COLOR } from '../src/game/discovery';
import { TRIBES, Tribe } from '../src/game/tribes';
import { START_RESOURCES } from '../src/game/resources';
import { Player } from '../src/game/players';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { SeededRandom } from '../src/util/random';

function player(index: number, tribe: Tribe): Player {
  return { index, tribe, isHuman: index === 0, name: `p${index}`, resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true };
}

describe('knownTribesFor', () => {
  it('always knows the local player own tribe', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('discovers a tribe whose unit stands on an explored tile', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers, Tribe.Warriors]));
  });

  it('ignores units on tiles the local player has not explored', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Warriors)];
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [1];
    tile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('ignores pirates (owner -1)', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers)];
    tileAt(map, 1, 0)!.unit = makeUnit('pirate', -1, 'pirate', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
  });

  it('does not count another player exploration', () => {
    const map = makeTestMap();
    const players = [player(0, Tribe.Villagers), player(1, Tribe.Cats), player(2, Tribe.Aqua)];
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [2];
    tile.unit = makeUnit('u1', 2, 'warrior', 1, 0);
    expect(knownTribesFor(map, players, 0)).toEqual(new Set([Tribe.Villagers]));
    expect(knownTribesFor(map, players, 2)).toEqual(new Set([Tribe.Aqua]));
  });
});

describe('territoryColor', () => {
  it('returns the tribe color when known and gray when unknown', () => {
    const forest = TRIBES.find((t) => t.id === Tribe.Forest)!;
    expect(territoryColor(forest, true)).toBe(forest.color);
    expect(territoryColor(forest, false)).toBe(UNKNOWN_TRIBE_COLOR);
    expect(UNKNOWN_TRIBE_COLOR).toBe(0x888888);
  });
});

describe('simulator discovery persistence', () => {
  it('records a tribe whose unit stands on an explored tile', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const sync = (sim as unknown as { syncDiscoveries(): void }).syncDiscoveries.bind(sim);
    expect(players[0]!.knownTribes).toEqual([Tribe.Villagers]);
    sync();
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });

  it('keeps a discovered tribe even after its unit leaves the explored tile', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyTile = tileAt(map, 1, 0)!;
    enemyTile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    const sync = (sim as unknown as { syncDiscoveries(): void }).syncDiscoveries.bind(sim);
    sync();
    enemyTile.unit = null;
    sync();
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });

  it('runs syncDiscoveries on every applied command', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    tileAt(map, 1, 0)!.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.applyCommand({ type: 'heal', unitId: 'does-not-exist' });
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });
});

describe('discovery notification', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces a newly met tribe via the center message', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyTribeName = TRIBES.find((t) => t.id === players[1]!.tribe)!.name;
    players[0]!.knownTribes = [Tribe.Villagers, players[1]!.tribe];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({ localPlayerIndex: 0, centerMessage: null });
    const gc = gameController as unknown as { knownTribeIds: Set<number>; syncKnownTribes(notify: boolean): void };
    gc.knownTribeIds = new Set([Tribe.Villagers]);
    vi.useFakeTimers();
    gc.syncKnownTribes(true);
    vi.advanceTimersByTime(0);
    expect(useGameStore.getState().centerMessage).toBe(`You meet ${enemyTribeName}!`);
  });

  it('does not announce an already-known tribe', () => {
    const map = makeTestMap();
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({ localPlayerIndex: 0, centerMessage: null });
    const gc = gameController as unknown as { knownTribeIds: Set<number>; syncKnownTribes(notify: boolean): void };
    gc.knownTribeIds = new Set([Tribe.Villagers]);
    gc.syncKnownTribes(true);
    expect(useGameStore.getState().centerMessage).toBeNull();
  });
});
