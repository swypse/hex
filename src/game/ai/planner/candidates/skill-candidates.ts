import { AiActionType, BuildingKind, FoodPressure, SkillId } from '@enums';
import { BUILDING_COSTS, networkBuildingIncome } from '../../../economy/buildings';
import { foodPressure } from '../../../economy/food';
import { ROAD_COST } from '../../../economy/roads';
import { networkStock, totalStock } from '../../../economy/stock';
import { axialKey } from '../../../map/hex';
import { canOpenSkill, hasSkill, skillCost } from '../../../skills';
import { flagsFor } from '../../config/flags';
import { personalityFor } from '../../config/personality';
import { towerSkillWanted } from '../../defense/tower-skill-wanted';
import { AI_SKILL_ORDER, MILITARY_SKILL_ORDER } from '../../economy/skill-orders';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Stone stock under which the AI wants Geology (double mine output). */
const GEOLOGY_STONE_BELOW = 20;

/** Skill options; returns the money the AI keeps for the food-path skill it is waiting for. */
export function skillCandidates(ctx: CandidateContext, candidates: Candidate[]): number {
  const { map, player, state, situation, directives, jitter, foodStates, foodPlan, agronomyWanted, storage, storageScore } = ctx;
  // Without farms the army starves: learning Agriculture beats any skill plan
  // once the food stock is under pressure.
  if (!hasSkill(player, SkillId.AGRICULTURE) && !state.opened.has(SkillId.AGRICULTURE) && canOpenSkill(player, SkillId.AGRICULTURE, map) && foodPressure(map, player) !== FoodPressure.NONE) {
    candidates.push({ score: 550 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: SkillId.AGRICULTURE } });
  }

  if (agronomyWanted && !state.opened.has(SkillId.AGRONOMY) && canOpenSkill(player, SkillId.AGRONOMY, map)) {
    candidates.push({ score: 535 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: SkillId.AGRONOMY } });
  }

  if (storage.needy.size > 0 && hasSkill(player, SkillId.AGRICULTURE) && !hasSkill(player, SkillId.GRANARY) && !state.opened.has(SkillId.GRANARY) && canOpenSkill(player, SkillId.GRANARY, map)) {
    candidates.push({ score: storageScore + 10 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: SkillId.GRANARY } });
  }

  // Farms cost wood and stone: with food under pressure and no income of one of
  // them, head for the skill whose building produces it (Forestry -> sawmill,
  // Climbing + Smithery -> mine) so the first farm can be paid for.
  // Money the AI must keep to afford the food-path skill it is waiting for.
  let foodSkillReserve = 0;
  if (hasSkill(player, SkillId.AGRICULTURE) && (foodPressure(map, player) !== FoodPressure.NONE || storage.needy.size > 0)) {
    const wanted: SkillId[] = [];
    // Roads (and granaries) need stone: a planned road link with no stone in
    // sight also heads for the mine skills.
    const stoneNeeded = Math.max(
      foodPlan.roads.length > 0 ? ROAD_COST.stone : BUILDING_COSTS.farm.stone,
      storage.needy.size > 0 && hasSkill(player, SkillId.GRANARY) ? BUILDING_COSTS.granary.stone : 0,
    );
    // Judged per hungry network: its own wood/stone and the income of the
    // buildings feeding it.
    for (const net of foodStates.filter((n) => n.pressure !== FoodPressure.NONE || storage.needy.has(axialKey(n.villages[0]!)))) {
      const home = net.villages[0]!;
      const have = networkStock(map, home);
      const income = networkBuildingIncome(map, player, home);
      if (have.wood < BUILDING_COSTS.farm.wood && income.wood === 0 && !wanted.includes(SkillId.FORESTRY)) wanted.push(SkillId.FORESTRY);
      if (have.stone < stoneNeeded && income.stone === 0 && !wanted.includes(SkillId.CLIMBING)) wanted.push(SkillId.CLIMBING, SkillId.SMITHERY);
    }
    for (const id of wanted) {
      if (hasSkill(player, id) || state.opened.has(id)) continue;
      foodSkillReserve = skillCost(id, player.skills.length);
      if (canOpenSkill(player, id, map)) candidates.push({ score: 540 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: id } });
      break;
    }
  }

  // Geology doubles what a mine yields: worth learning once the AI has mines
  // but is still short of stone (Science first, its parent).
  if (hasSkill(player, SkillId.SMITHERY) && !hasSkill(player, SkillId.GEOLOGY) && totalStock(map, player.index).stone < GEOLOGY_STONE_BELOW && map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === BuildingKind.MINE)) {
    for (const id of [SkillId.GEOLOGY, SkillId.SCIENCE]) {
      if (state.opened.has(id) || !canOpenSkill(player, id, map)) continue;
      candidates.push({ score: 450 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: id } });
      break;
    }
  }

  // Villages under pressure head for towers (Shields -> Defense -> Tower).
  const towerSkill = towerSkillWanted(map, player);
  if (towerSkill && !state.opened.has(towerSkill) && canOpenSkill(player, towerSkill, map)) {
    candidates.push({ score: 330 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: towerSkill } });
  }

  // A directive skill chain (economy/naval strategy) is opened before the
  // generic economy skill order so the AI commits to its plan's tech path.
  if (directives?.skillChain) {
    for (const id of directives.skillChain) {
      if (state.opened.has(id)) continue;
      if (canOpenSkill(player, id, map)) {
        candidates.push({ score: 300 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: id } });
        break;
      }
    }
  } else if (!situation?.navalThreat) {
    const order = personalityFor(player).skillOrder ?? (flagsFor(player).militarySkills ? MILITARY_SKILL_ORDER : AI_SKILL_ORDER);
    for (const id of order) {
      if (state.opened.has(id)) continue;
      if (canOpenSkill(player, id, map)) {
        const rank = order.indexOf(id);
        candidates.push({ score: 240 - rank * 8 + jitter(), action: { type: AiActionType.OPEN_SKILL, skill: id } });
      }
    }
  }
  return foodSkillReserve;
}
