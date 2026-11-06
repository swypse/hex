import { AiActionType, OpeningStage } from '@enums';
import { pendingSettleVillages, settleSites } from './settle-stage';
import { stageStep } from './stage-step';
import { BUILDING_COSTS } from '../../economy/buildings';
import { villageUpgradeCost } from '../../economy/resources';
import { canAffordAt, capitalOf } from '../../economy/stock';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { canOpenSkill, hasSkill } from '../../skills';
import { isClaimedBy } from '../situation/is-claimed-by';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { CAN_BUILD, openingStage, STAGE_BUILDING, STAGE_SKILLS } from './opening-stage';

/** The next step of the opening build order, then of each captured village's sawmill and mine: build it when possible, otherwise
 *  learn the skill it needs. Null while waiting for money or materials. */
export function openingAction(map: GameMap, player: Player, done: AiPlannerState): AiAction[] | null {
  const stage = openingStage(map, player, done);
  const v = capitalOf(map, player.index);
  if (!v?.settlement) return null;
  if (!stage) {
    // The first village is done: captured villages get their sawmill and mine.
    const next = pendingSettleVillages(map, player, done)[0];
    return next ? stageStep(map, player, done, next.stage, settleSites(map, player, next.village, next.stage, done)) : null;
  }
  if (stage === OpeningStage.UPGRADE) {
    if (done.upgraded.has(`${v.q},${v.r}`)) return null;
    return canAffordAt(map, player, v, villageUpgradeCost(v.settlement.level)) ? [{ type: AiActionType.UPGRADE, q: v.q, r: v.r }] : null;
  }
  const claimed = map.tiles.filter((t) => isClaimedBy(t, v));
  const sites = claimed.filter((t) => !done.built.has(`${t.q},${t.r}`) && CAN_BUILD[STAGE_BUILDING[stage]!]!(map, t, player));
  return stageStep(map, player, done, stage, sites);
}
