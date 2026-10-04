import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/game/map-gen';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { Tribe, TRIBES } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { AiDifficulty, CommandType, GameMode } from '@enums';

function makeSim(seed: number): Simulator {
  const players = buildPlayers(TRIBES[0]!.id as Tribe, 3, new SeededRandom(seed), AiDifficulty.HARD);
  const map = generateMap(players.length, seed);
  const sim: Simulator = new Simulator(map, players, GameMode.CAPTURE, {
    rng: new SeededRandom(seed + 1).next.bind(new SeededRandom(seed + 1)),
    aiRng: (): SeededRandom => new SeededRandom(seed * 7 + sim.turn),
  });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

describe('applyCommandSteps(END_TURN)', () => {
  it('leaves the same state and events as the synchronous applyCommand, turn after turn', () => {
    const a = makeSim(11);
    const b = makeSim(11);
    for (let turn = 0; turn < 12 && !a.gameOver; turn++) {
      const okA = a.applyCommand({ type: CommandType.END_TURN });
      const steps = b.applyCommandSteps({ type: CommandType.END_TURN });
      let step = steps.next();
      let yields = 0;
      while (!step.done) {
        yields++;
        step = steps.next();
      }
      expect(step.value).toBe(okA);
      expect(JSON.stringify(b.snapshot())).toBe(JSON.stringify(a.snapshot()));
      expect(b.drainEvents()).toEqual(a.drainEvents());
      // an AI round pauses at least once per AI seat
      expect(yields).toBeGreaterThanOrEqual(a.players.filter((p) => !p.isHuman && p.isActive).length);
    }
  });

  it('runs a non end-turn command in a single step', () => {
    const sim = makeSim(5);
    const steps = sim.applyCommandSteps({ type: CommandType.CLAIM_BONUS });
    const first = steps.next();
    expect(first.done).toBe(true);
  });
});
