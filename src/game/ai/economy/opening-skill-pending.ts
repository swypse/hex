import type { SkillId } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill, SKILLS } from '../../skills';
import { flagsFor } from '../config/flags';
import type { AiPlannerState } from '../types/planner-state';
import { openingStage, STAGE_SKILLS } from './opening-stage';

/** The skill the capital's opening is waiting for (its parent is known, so it only needs money), while the
 *  `openingSkillFirst` flag asks other skill plans to leave that money alone. Null otherwise. */
export function openingSkillPending(map: GameMap, player: Player, state: AiPlannerState): SkillId | null {
  if (!flagsFor(player).openingSkillFirst) return null;
  const stage = openingStage(map, player, state);
  const pending = stage ? STAGE_SKILLS[stage].find((id) => !hasSkill(player, id)) : undefined;
  if (!pending) return null;
  const parent = SKILLS[pending].parent;
  return !parent || hasSkill(player, parent) ? pending : null;
}
