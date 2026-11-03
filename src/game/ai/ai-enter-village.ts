import { hasSkill } from '../skills';
import { reachableTargets } from '../units/selection';
import { type AiAction } from './ai-types';
import { type AiPattern } from './ai-pattern-helpers';
import { AiActionType, SkillId } from '@enums';

/** Runs right after a group attack: the unit held back by the attack planner
 *  steps onto the village if its defender died; otherwise it is released. */
export const ENTER_VILLAGE_PATTERN: AiPattern = {
  id: 'enter-village',
  priority: 196,
  evaluate({ map, player, state }): AiAction[] | null {
    const entry = state.entry;
    while (entry && entry.length > 0) {
      const e = entry.shift()!;
      state.moved.delete(e.unitId);
      const village = map.tiles.find((t) => t.q === e.q && t.r === e.r);
      const from = map.tiles.find((t) => t.unit?.id === e.unitId && t.unit.owner === player.index);
      if (!village || !from?.unit || village.unit) continue;
      if (village.settlement?.owner === player.index || state.acted.has(e.unitId)) continue;
      const canClimb = hasSkill(player, SkillId.CLIMBING);
      const canDock = hasSkill(player, SkillId.NAVIGATION);
      if (!reachableTargets(map, from.unit, undefined, canClimb, canDock, player.index).some((c) => c.q === e.q && c.r === e.r)) continue;
      return [{ type: AiActionType.MOVE, unitId: e.unitId, q: e.q, r: e.r }];
    }
    return null;
  },
};
