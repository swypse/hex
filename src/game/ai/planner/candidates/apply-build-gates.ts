import { BuildingKind } from '@enums';
import { flagsFor } from '../../config/flags';
import { blockedByGarrisonReserve } from '../../defense/blocked-by-garrison-reserve';
import { garrisonReserveVillages } from '../../defense/garrison-reserve-villages';
import { blockedByOpening } from '../../economy/blocked-by-opening';
import { blockedByStone } from '../../economy/blocked-by-stone';
import { villagesNeedingMine } from '../../economy/villages-needing-mine';
import type { AiAction } from '../../types/action';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Drops spends blocked by the opening build order, the stone focus or the garrison reserve. */
export function applyBuildGates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, situation } = ctx;
  // A mine first: money-spending candidates wait until every village that can
  // have a mine has one (see ai-stone.ts).
  const needy = flagsFor(player).stoneFocus && !state.plannedKinds?.has(BuildingKind.MINE) ? villagesNeedingMine(map, player) : [];
  const bareVillages = garrisonReserveVillages(map, player);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const action = candidates[i]!.action;
    const first: AiAction = Array.isArray(action) ? action[0]! : action;
    if (bareVillages.length > 0 && blockedByGarrisonReserve(map, player, first, bareVillages)) {
      candidates.splice(i, 1);
      continue;
    }
    if (blockedByOpening(map, player, first, situation, state) || blockedByStone(map, player, first, situation, needy)) candidates.splice(i, 1);
  }
}
