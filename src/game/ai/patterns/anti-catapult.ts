import { SKILLS, canOpenSkill, hasSkill } from '../../skills';
import { type AiAction } from '../ai-types';
import { type AiPattern, visibleEnemyCatapults } from '../ai-pattern-helpers';
import { AiActionType, SkillId } from '@enums';

/** Skills to open for `goal`, root first (the goal's missing ancestors, then the goal). */
function missingPath(goal: SkillId, has: (id: SkillId) => boolean): SkillId[] {
  const path: SkillId[] = [];
  for (let id: SkillId | null = goal; id && !has(id); id = SKILLS[id].parent) path.unshift(id);
  return path;
}

export const ANTI_CATAPULT_PATTERNS: AiPattern[] = [
  {
    // A visible enemy catapult makes knights the answer: research them (and the
    // skills they need) as soon as the money allows.
    id: 'research-knights-vs-catapult',
    priority: 78,
    evaluate({ map, player, state }): AiAction[] | null {
      if (hasSkill(player, SkillId.KNIGHTS) || visibleEnemyCatapults(map, player.index) === 0) return null;
      for (const skill of missingPath(SkillId.KNIGHTS, (id) => hasSkill(player, id) || state.opened.has(id))) {
        if (canOpenSkill(player, skill, map)) return [{ type: AiActionType.OPEN_SKILL, skill }];
        break;
      }
      return null;
    },
  },
];
