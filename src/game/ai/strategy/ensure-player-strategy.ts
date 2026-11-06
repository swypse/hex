import { SeededRandom } from '@/util';
import type { Player } from '../../players';
import { personalityFor } from '../config/personality';
import type { AiStrategyState } from '../types/strategy-state';

export function ensurePlayerStrategy(player: Player, rng: SeededRandom): AiStrategyState {
  if (!player.strategy) {
    const personality = personalityFor(player);
    player.strategy = { personalityId: personality.id, nextPlanTurn: 0, goals: [] };
  }
  return player.strategy;
}
