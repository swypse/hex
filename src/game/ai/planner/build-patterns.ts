import { BuildingKind } from '@enums';
import { flagsFor } from '../config/flags';
import { blockedByGarrisonReserve } from '../defense/blocked-by-garrison-reserve';
import { garrisonReserveVillages } from '../defense/garrison-reserve-villages';
import { blockedByOpening } from '../economy/blocked-by-opening';
import { blockedByStone } from '../economy/blocked-by-stone';
import { villagesNeedingMine } from '../economy/villages-needing-mine';
import { AI_PATTERNS } from '../patterns/all-patterns';
import { MARCH_PATTERN } from '../patterns/march';
import { OPENING_PATTERN } from '../patterns/opening-build-order';
import type { AiPatternContext } from '../patterns/pattern-types';
import { SEASON_SAFETY_PATTERN } from '../patterns/season-safety';
import { OPERATION_PATTERN } from '../patterns/squad-operation';
import type { AiAction } from '../types/action';

/** Pattern list with the squad operation slotted in after the lone-hunter and
 *  naval patterns, right before frontier exploration: a unit that can kill or
 *  chase down an enemy on its own this turn still does so (hunt-idle-enemy
 *  claims it first), and only units with nothing better to do join the squad's
 *  gather/assault march. Benchmarked: placing it *before* hunt-idle-enemy
 *  regressed the AI (44% win rate, fewer enemy villages captured) because it
 *  pulled units away from easy solo kills to wait for the group instead. */
export function buildPatterns() {
  return [SEASON_SAFETY_PATTERN, ...AI_PATTERNS].flatMap((p) => (p.id === 'explore-frontier' ? [OPENING_PATTERN, OPERATION_PATTERN, p, MARCH_PATTERN] : [p])).map(withStoneGate);
}

/** A pattern whose step would spend money while a mine is still missing
 *  yields nothing, so the planner moves on to the next pattern. */
function withStoneGate<T extends { evaluate(ctx: AiPatternContext): AiAction[] | null }>(pattern: T): T {
  return {
    ...pattern,
    evaluate(ctx: AiPatternContext): AiAction[] | null {
      const steps = pattern.evaluate(ctx);
      if (!steps) return steps;
      if (steps.some((a) => blockedByOpening(ctx.map, ctx.player, a, ctx.situation, ctx.state))) return null;
      const bare = garrisonReserveVillages(ctx.map, ctx.player);
      if (bare.length > 0 && steps.some((a) => blockedByGarrisonReserve(ctx.map, ctx.player, a, bare))) return null;
      if (!flagsFor(ctx.player).stoneFocus) return steps;
      const needy = ctx.state.plannedKinds?.has(BuildingKind.MINE) ? [] : villagesNeedingMine(ctx.map, ctx.player);
      return steps.some((a) => blockedByStone(ctx.map, ctx.player, a, ctx.situation, needy)) ? null : steps;
    },
  };
}
