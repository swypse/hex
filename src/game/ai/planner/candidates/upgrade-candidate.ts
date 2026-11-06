import { AiActionType } from '@enums';
import { villageUpgradeCost } from '../../../economy/resources';
import { canAffordAt } from '../../../economy/stock';
import { unitsInVillage, villageCapacity } from '../../../economy/village';
import type { MapTile } from '../../../map/map-gen';
import { flagsFor } from '../../config/flags';
import { hasPendingMineSlot } from '../../economy/mine-slot';
import { nearestEnemyDistanceFrom } from '../../situation/nearest-distances';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Offers to upgrade the village when affordable; fronts and mine-locked villages score higher. */
export function upgradeCandidate(ctx: CandidateContext, v: MapTile, candidates: Candidate[]): void {
  const { map, player, state, jitter } = ctx;
  const k = key(v.q, v.r);
  if (!state.upgraded.has(k) && canAffordAt(map, player, v, villageUpgradeCost(v.settlement!.level))) {
    const front = nearestEnemyDistanceFrom(map, player.index, v) <= 4;
    const level = v.settlement!.level;
    const boost = hasPendingMineSlot(map, player, v) ? 260 : level <= 2 && !front ? 90 : 0;
    // Army first: a level 3+ village with free unit slots spends on units before growing taller.
    const underManned = flagsFor(player).armyFirst && level >= 3 && boost === 0 && unitsInVillage(map, v) < villageCapacity(level) - 1;
    candidates.push({ score: (underManned ? 150 : front ? 700 : 400) + boost + jitter(), action: { type: AiActionType.UPGRADE, q: v.q, r: v.r } });
  }

}
