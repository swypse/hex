import { describe, it, expect } from 'vitest';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { planAiActions } from '../src/game/ai';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';

describe('AI behavior scenarios', () => {
  it('captures a reachable enemy village when it holds a strong advantage', () => {
    const map = makeTestMap(6);
    const village = tileAt(map, 5, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false };
    village.ownedBy = 0;
    // AI capital + a small army on the path to the enemy village.
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    capital.unit = makeUnit('cap', 1, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.unit = makeUnit('w1', 1, 'warrior', 1, 0);
    tileAt(map, 2, 0)!.unit = makeUnit('w2', 1, 'warrior', 2, 0);
    tileAt(map, 3, 0)!.unit = makeUnit('w3', 1, 'warrior', 3, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 20 && !sim.gameOver; i++) {
      sim.applyCommand({ type: 'endTurn' });
      if (village.settlement!.owner === 1) break;
    }
    expect(village.settlement!.owner).toBe(1);
  });

  it('does not let a raider capture a defended AI capital', () => {
    const map = makeTestMap(6);
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    // AI knight one hex off the capital, ready to garrison/repel.
    tileAt(map, 0, -1)!.unit = makeUnit('knight', 1, 'knight', 0, -1);
    // Enemy raider, two hexes east (human-controlled; we walk it toward the capital each round).
    const raider = makeUnit('raider', 0, 'warrior', 2, 0);
    const raiderTile = tileAt(map, 2, 0)!;
    raiderTile.unit = raider;
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'normal');
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    for (let i = 0; i < 8; i++) {
      // Human: walk the raider one step toward the capital and end the turn.
      if (raiderTile.unit === raider) {
        const step = tileAt(map, raider.q - 1, raider.r);
        if (step) sim.applyCommand({ type: 'move', unitId: raider.id, q: step.q, r: step.r });
      }
      sim.applyCommand({ type: 'endTurn' });
    }
    expect(capital.settlement!.owner).toBe(1);
    expect(tileAt(map, 0, 0)!.unit?.owner ?? null).not.toBe(0);
  });

  it('runs a full 30-turn game to completion without errors', () => {
    const map = makeTestMap(6);
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    capital.unit = makeUnit('cap', 1, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'hard');
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5, aiRng: () => new SeededRandom(3) });
    sim.startGame();
    for (let i = 0; i < 35 && !sim.gameOver; i++) {
      sim.applyCommand({ type: 'endTurn' });
    }
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).not.toBeNull();
  });

  it('does not crash when an easy AI exhausts every possible action', () => {
    const map = makeTestMap(6);
    const humanVillage = tileAt(map, 5, 0)!;
    humanVillage.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    humanVillage.ownedBy = 0;
    const capital = tileAt(map, 0, 0)!;
    capital.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    capital.ownedBy = 1;
    capital.unit = makeUnit('cap', 1, 'warrior', 0, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'easy');
    const sim = new Simulator(map, players, 'turns30', {
      rng: () => 0.5,
      aiRng: () => ({ next: () => 0 } as SeededRandom),
    });
    sim.startGame();
    for (let i = 0; i < 35 && !sim.gameOver; i++) {
      sim.applyCommand({ type: 'endTurn' });
    }
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).not.toBeNull();
  });

  it('plans nothing instead of throwing when the AI has no valid action and its mistake roll fires', () => {
    const map = makeTestMap(2);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'easy');
    const broke = players[1]!;
    broke.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
    const alwaysRollMistake = { next: () => 0 } as SeededRandom;
    expect(planAiActions(map, broke, alwaysRollMistake, 'capture')).toEqual([]);
  });

  it('re-garrisons its village when the last defender attacks from it and dies', () => {
    // The AI's only defender is an archer parked on its capital next to a
    // knight it cannot one-shot. If it attacks it dies to the counter — the AI
    // may take the trade only because it can afford to respawn a guard on the
    // village right after, so the village is never left empty.
    const map = makeTestMap(6);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    village.ownedBy = 1;
    const garrison = makeUnit('garrison', 1, 'archer', 0, 0);
    garrison.spawnVillage = { q: 0, r: 0 };
    village.unit = garrison;
    // A second AI village so capture-mode has more than one owned settlement
    // and the game does not end instantly when the AI owns everything.
    const extra = tileAt(map, 2, 0)!;
    extra.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    extra.ownedBy = 0;
    tileAt(map, 1, 0)!.unit = makeUnit('enemy', 0, 'knight', 1, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'easy');
    players[1]!.resources = { wood: 50, stone: 50, money: 100, ore: 10 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.applyCommand({ type: 'endTurn' });
    expect(village.unit).not.toBeNull();
    expect(village.unit!.owner).toBe(1);
  });

  it('keeps a lone garrison that cannot be replaced from attacking to its death', () => {
    const map = makeTestMap(6);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    village.ownedBy = 1;
    const garrison = makeUnit('broke', 1, 'archer', 0, 0);
    garrison.spawnVillage = { q: 0, r: 0 };
    village.unit = garrison;
    const extra = tileAt(map, 2, 0)!;
    extra.settlement = { owner: 0, level: 1, captureReady: false, capital: true };
    extra.ownedBy = 0;
    tileAt(map, 1, 0)!.unit = makeUnit('enemy', 0, 'knight', 1, 0);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1), 'easy');
    players[1]!.resources = { wood: 0, stone: 0, money: 0, ore: 0 };
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.applyCommand({ type: 'endTurn' });
    // The garrison held its ground instead of dying: the village keeps its unit.
    expect(village.unit).not.toBeNull();
    expect(village.unit!.id).toBe('broke');
  });
});
