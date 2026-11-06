import { GameMode } from '@enums';
import { SeededRandom } from '../../../util/random';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiAction } from '../types/action';
import { planAiActionsSteps } from './plan-ai-actions-steps';

/** Executes one planned action on the live game and reports whether it took
 *  effect. Supplying it switches the planner to live mode: every step is
 *  applied before the next is chosen, so patterns always see the real board
 *  (kills, misses, counter damage, spent money) instead of a frozen snapshot. */
export type AiActionExecutor = (action: AiAction) => boolean;

export function planAiActions(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = GameMode.CAPTURE,
  turn: number = 0,
  execute?: AiActionExecutor,
): AiAction[] {
  const steps = planAiActionsSteps(map, player, rng, mode, turn, execute);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
