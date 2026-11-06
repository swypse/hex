import { AiActionType, OpeningStage } from '@enums';
import { BUILDING_COSTS } from '../../economy/buildings';
import { canAffordAt } from '../../economy/stock';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { canOpenSkill, hasSkill } from '../../skills';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { STAGE_BUILDING, STAGE_SKILLS } from './opening-stage';

/** The next step towards a build stage: learn the skill it needs, otherwise build it on the
 *  first of `sites`. Null while waiting for money, materials or a site. */
export function stageStep(map: GameMap, player: Player, done: AiPlannerState, stage: OpeningStage, sites: MapTile[]): AiAction[] | null {
  const skill = STAGE_SKILLS[stage].find((s) => !hasSkill(player, s));
  if (skill) return !done.opened.has(skill) && canOpenSkill(player, skill, map) ? [{ type: AiActionType.OPEN_SKILL, skill }] : null;
  const kind = STAGE_BUILDING[stage]!;
  const site = sites[0];
  if (!site || !canAffordAt(map, player, site, BUILDING_COSTS[kind as keyof typeof BUILDING_COSTS])) return null;
  return [{ type: AiActionType.BUILD, q: site.q, r: site.r, kind }];
}
