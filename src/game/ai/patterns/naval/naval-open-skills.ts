import { AiActionType, SkillId } from '@enums';
import { canOpenSkill, hasSkill } from '../../../skills';
import { openingSkillPending } from '../../economy/opening-skill-pending';
import { styleAllowsSkill } from '../../config/skill-style';
import type { AiAction } from '../../types/action';
import type { AiPattern } from '../pattern-types';

export const NAVAL_OPEN_SKILLS_PATTERN: AiPattern = {
    id: 'naval-open-skills',
    priority: 78,
    evaluate({ map, player, state, situation }): AiAction[] | null {
      if (!situation || !situation.navalThreat) return null;
      if (!situation.endangered && openingSkillPending(map, player, state)) return null;
      const chain: SkillId[] = [SkillId.WATER, SkillId.NAVIGATION, SkillId.CATAPULT];
      for (const skill of chain) {
        if (state.opened.has(skill) || (skill === SkillId.CATAPULT && !styleAllowsSkill(player, skill))) continue;
        if (skill === SkillId.CATAPULT && !hasSkill(player, SkillId.ARCHER)) {
          if (!state.opened.has(SkillId.ARCHER) && canOpenSkill(player, SkillId.ARCHER)) {
            return [{ type: AiActionType.OPEN_SKILL, skill: SkillId.ARCHER }];
          }
          continue;
        }
        if (canOpenSkill(player, skill)) return [{ type: AiActionType.OPEN_SKILL, skill }];
      }
      return null;
    },
  };
