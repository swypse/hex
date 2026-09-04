import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers, buildMultiplayerPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { TileType } from '../src/game/tileTypes';
import { hexNeighbors } from '../src/game/hex';

function villageFor(map: ReturnType<typeof makeTestMap>, q: number, r: number, owner: number): void {
  tileAt(map, q, r)!.settlement = { owner, level: 1, captureReady: false };
  tileAt(map, q, r)!.ownedBy = owner;
}

describe('Simulator turn engine', () => {
  it('single player: endTurn runs AI players, applies income, returns to human with turn+1', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    villageFor(map, 1, 0, 2);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(sim.currentPlayerIndex).toBe(0);
    expect(sim.turn).toBe(2);
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'turnStarted', playerIndex: 0, turn: 2 });
    expect(players[0]!.resources.money).toBe(15 + 4);
  });

  it('two humans: endTurn stops at the other human before income', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    const players = buildMultiplayerPlayers(
      [{ name: 'A', tribe: Tribe.Cats }, { name: 'B', tribe: Tribe.Warriors }],
      0,
      new SeededRandom(1),
    );
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.currentPlayerIndex).toBe(1);
    expect(sim.turn).toBe(1);
    expect(players[0]!.resources.money).toBe(5);
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.currentPlayerIndex).toBe(0);
    expect(sim.turn).toBe(2);
    expect(players[0]!.resources.money).toBe(9);
  });

  it('capture win triggers gameOver at round end', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    const events = sim.drainEvents();
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).toBe(0);
    expect(events.some((e) => e.type === 'gameOver')).toBe(true);
  });

  it('turns30 win triggers gameOver once turn reaches 30', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.turn = 29;
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.gameOver).toBe(true);
    expect(sim.turn).toBe(30);
  });

  it('auto-heals an idle damaged unit of the human player at turn end', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('me', 0, 'warrior', 0, 0);
    u.hp = 40;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(50);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'healed' && e.unitId === 'me')).toBe(true);
  });

  it('does not auto-heal a damaged unit that already acted', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('me', 0, 'warrior', 0, 0);
    u.hp = 3;
    u.hasAttacked = true;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(3);
  });

  it('does not auto-heal a freshly spawned unit', () => {
    const map = makeTestMap();
    villageFor(map, 0, 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const u = makeUnit('spawned', 0, 'warrior', 0, 0);
    u.hp = 3;
    u.hasMoved = true;
    u.hasAttacked = true;
    u.hasHealed = true;
    tileAt(map, 0, 0)!.unit = u;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(u.hp).toBe(3);
  });

  it('auto-heals an idle damaged AI unit when its turn ends', () => {
    const map = makeTestMap(4);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const aiUnit = makeUnit('ai', 1, 'warrior', 0, 2);
    aiUnit.hp = 2;
    tileAt(map, 0, 2)!.unit = aiUnit;
    for (const n of hexNeighbors({ q: 0, r: 2 })) {
      const t = tileAt(map, n.q, n.r);
      if (t) t.terrain = TileType.GrasslandMountain;
    }
    const archer = makeUnit('arc', 0, 'archer', 2, 2);
    tileAt(map, 2, 2)!.unit = archer;
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'endTurn' });
    expect(aiUnit.hp).toBe(22);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'healed' && e.unitId === 'ai')).toBe(true);
  });
});
