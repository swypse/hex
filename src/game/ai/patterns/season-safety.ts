import { AiActionType, Season, SkillId } from '@enums';
import type { GameMap, MapTile } from '../../map/map-gen';
import { isWaterType } from '../../map/tile-types';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { reachableTargets } from '../../units/selection';
import type { Unit } from '../../units/units';
import { lastTurnOf, seasonUnsafe } from '../review/season-unsafe';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { key } from '../util/tile-key';
import type { AiPattern } from './pattern-types';

/** Moves own units off ice on the last winter turn and ships off coast water
 *  on the last autumn turn. */
export const SEASON_SAFETY_PATTERN: AiPattern = {
  id: 'season-safety',
  priority: 600,
  evaluate({ map, player, state, turn = 0 }): AiAction[] | null {
    if (!lastTurnOf(turn, Season.WINTER) && !lastTurnOf(turn, Season.AUTUMN)) return null;
    for (const t of map.tiles) {
      const unit = t.unit;
      if (!unit || unit.owner !== player.index) continue;
      if (state.moved.has(unit.id) || state.acted.has(unit.id)) continue;
      if (!seasonUnsafe(map, turn, t, unit)) continue;
      const dest = safeStep(map, player, turn, t, unit, state);
      if (dest) return [{ type: AiActionType.MOVE, unitId: unit.id, q: dest.q, r: dest.r }];
    }
    return null;
  },
};

function safeStep(map: GameMap, player: Player, turn: number, from: MapTile, unit: Unit, state: AiPlannerState): MapTile | null {
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const c of reachableTargets(map, unit, undefined, canClimb, true, player.index)) {
    if (state.occupied.has(key(c.q, c.r))) continue;
    if (unit.shipLevel !== undefined && !isWaterType(c.terrain)) continue;
    if (seasonUnsafe(map, turn, c, unit)) continue;
    // Prefer the nearest safe tile: it keeps the unit where it was useful.
    const d = Math.abs(c.q - from.q) + Math.abs(c.r - from.r);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
