import { AiActionType, AiPickMode, GameMode } from '@enums';
import { SeededRandom } from '../../../util/random';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { profileFor } from '../config/difficulty';
import { flagsFor } from '../config/flags';
import { updateOperation } from '../military/update-operation';
import type { AiPatternContext } from '../patterns/pattern-types';
import { seasonVetoed } from '../review/season-vetoed';
import { stepVetoed } from '../review/step-veto';
import { tornadoVetoed } from '../review/tornado-veto';
import { analyzeSituation } from '../situation/analyze-situation';
import { deriveDirectives } from '../strategy/derive-directives';
import { updateStrategy } from '../strategy/update-strategy';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { aiStepTrace } from './ai-step-trace';
import { bestAvailableAction } from './best-available-action';
import { buildPatterns } from './build-patterns';
import { markUsed } from './mark-used';
import type { AiActionExecutor } from './plan-ai-actions';

const MAX_PLAN_STEPS = 200;

/** `planAiActions` as a generator that pauses after each planned step when an
 *  executor is given (live engine), so a caller can hand control back to the
 *  browser between steps instead of running the whole turn in one long task. */
export function* planAiActionsSteps(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  mode: GameMode = GameMode.CAPTURE,
  turn: number = 0,
  execute?: AiActionExecutor,
): Generator<void, AiAction[], void> {
  const difficulty = profileFor(player);
  let situation = analyzeSituation(map, player, mode, difficulty);
  const strategy = updateStrategy(map, player, situation, mode, difficulty, turn, rng);
  let directives = deriveDirectives(map, player, situation, difficulty, strategy);
  const state: AiPlannerState = {
    moved: new Set(),
    acted: new Set(),
    upgraded: new Set(),
    spawned: new Set(),
    built: new Set(),
    plannedKinds: new Set(),
    opened: new Set(),
    occupied: new Set(),
  };
  const patterns = buildPatterns();
  const operation = updateOperation(map, player, situation, turn);
  const actions: AiAction[] = [];
  if (execute) yield;
  for (let i = 0; i < MAX_PLAN_STEPS; i++) {
    if (execute && i > 0) {
      situation = analyzeSituation(map, player, mode, difficulty);
      directives = deriveDirectives(map, player, situation, difficulty, strategy);
      // Re-analysis and pattern search are each a few ms: pause between them
      // so a step never holds the main thread for both.
      yield;
    }
    const ctx: AiPatternContext = { map, player, rng, state, situation, difficulty, directives, operation, turn };
    let next: AiAction[] | null = null;
    let sourceId = 'fallback';
    const review = difficulty.lookahead && flagsFor(player).lookahead;
    for (const pattern of patterns) {
      next = pattern.evaluate(ctx);
      if (next && (seasonVetoed(map, turn, next) || tornadoVetoed(map, next) || (review && stepVetoed(map, player, next, state)))) next = null;
      if (next) {
        sourceId = pattern.id;
        break;
      }
    }
    if (!next) {
      const source: { kind: AiPickMode } = { kind: AiPickMode.BEST };
      next = bestAvailableAction(map, player, rng, state, situation, difficulty, directives, source);
    }
    if (!next) break;
    aiStepTrace.hook?.(sourceId, next);
    if (seasonVetoed(map, turn, next) || tornadoVetoed(map, next) || (review && stepVetoed(map, player, next, state))) {
      // The fallback pick is unsafe too: keep its unit where it stands.
      for (const a of next) if (a.type === AiActionType.MOVE) state.moved.add(a.unitId);
      continue;
    }
    // A failed action cancels the rest of its step (e.g. the attack after a
    // failed move), but every action is still marked used so the planner
    // cannot pick the same doomed step again.
    let failed = false;
    for (const a of next) {
      actions.push(a);
      markUsed(state, a);
      if (a.type === AiActionType.ATTACK || a.type === AiActionType.STUN) {
        const hit = map.tiles.find((t) => t.q === a.q && t.r === a.r);
        if (hit?.settlement && hit.settlement.owner !== player.index) player.hitVillage = { q: a.q, r: a.r, turn };
      }
      if (execute && !failed && !execute(a)) failed = true;
    }
    if (execute) yield;
  }
  return actions;
}
