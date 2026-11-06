import { AiPickMode } from '@enums';
import { SeededRandom } from '../../../util/random';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiDifficultyProfile } from '../config/difficulty';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';
import type { AiDirectives } from '../types/directives';
import type { AiPlannerState } from '../types/planner-state';
import { applyBuildGates } from './candidates/apply-build-gates';
import { applyFoodReserve } from './candidates/apply-food-reserve';
import { bridgeCandidates } from './candidates/bridge-candidates';
import { buildingCandidates } from './candidates/building-candidates';
import type { Candidate } from './candidates/candidate';
import { buildCandidateContext } from './candidates/candidate-context';
import { foodCandidates } from './candidates/food-candidates';
import { linkCandidates } from './candidates/link-candidates';
import { pickCandidate } from './candidates/pick-candidate';
import { roadCandidates } from './candidates/road-candidates';
import { skillCandidates } from './candidates/skill-candidates';
import { unitCandidates } from './candidates/unit-candidates';
import { villageCandidates } from './candidates/village-candidates';

export function bestAvailableAction(
  map: GameMap,
  player: Player,
  rng: SeededRandom,
  state: AiPlannerState,
  situation: AiSituation | undefined,
  difficulty: AiDifficultyProfile | undefined,
  directives: AiDirectives | undefined,
  source?: { kind: AiPickMode },
): AiAction[] | null {
  const ctx = buildCandidateContext(map, player, rng, state, situation, difficulty, directives);
  const candidates: Candidate[] = [];
  villageCandidates(ctx, candidates);
  unitCandidates(ctx, candidates);
  foodCandidates(ctx, candidates);
  buildingCandidates(ctx, candidates);
  linkCandidates(ctx, candidates);
  roadCandidates(ctx, candidates);
  bridgeCandidates(ctx, candidates);
  const foodSkillReserve = skillCandidates(ctx, candidates);
  applyFoodReserve(ctx, candidates, foodSkillReserve);
  applyBuildGates(ctx, candidates);
  return pickCandidate(ctx, candidates, source);
}
