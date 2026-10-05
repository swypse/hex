import { describe, expect, it } from 'vitest';
import { generateMap } from '@/game/map-gen';
import { buildPlayers } from '@/game/players';
import { Simulator } from '@/game/simulator';
import { Tribe } from '@/game/tribes';
import { SeededRandom } from '@/util';
import { AiDifficulty, CommandType, GameMode } from '@enums';

describe('watching after the human is eliminated', () => {
  it('keeps playing the AI turns every round', () => {
    const players = buildPlayers(Tribe.Villagers, 3, new SeededRandom(5), AiDifficulty.NORMAL);
    const sim = new Simulator(generateMap(players.length, 7), players, GameMode.CAPTURE);
    sim.startGame();
    players[0]!.isActive = false;
    sim.applyCommand({ type: CommandType.END_TURN });
    const skillsAfterFirst = players.slice(1).reduce((n, p) => n + p.skills.length, 0);
    for (let i = 0; i < 12; i++) sim.applyCommand({ type: CommandType.END_TURN });
    expect(players.slice(1).reduce((n, p) => n + p.skills.length, 0)).toBeGreaterThan(skillsAfterFirst);
  });
});
