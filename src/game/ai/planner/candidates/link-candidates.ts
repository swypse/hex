import { AiActionType, BuildingKind } from '@enums';
import { BUILDING_COSTS, canBuildPort } from '../../../economy/buildings';
import { canBuildRoad } from '../../../economy/roads';
import { canAffordAt } from '../../../economy/stock';
import { flagsFor } from '../../config/flags';
import { planLinks } from '../../economy/network-links';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Score of a road or port that joins two of the AI's own village networks. */
const LINK_SCORE = 300;

/** Score of the next road tile toward the nearest enemy village. */
const ENEMY_ROAD_SCORE = 230;

/** Roads and ports joining the own village networks, and a road toward the nearest enemy village. */
export function linkCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, jitter, water } = ctx;
  if (flagsFor(player).networkLinks) {
    const links = planLinks(map, player, water);
    for (const tile of links.roads) {
      if (state.built.has(key(tile.q, tile.r)) || !canBuildRoad(map, tile, player)) continue;
      candidates.push({ score: LINK_SCORE + jitter(), action: { type: AiActionType.BUILD_ROAD, q: tile.q, r: tile.r } });
    }
    for (const tile of links.ports) {
      if (state.built.has(key(tile.q, tile.r)) || !canBuildPort(map, tile, player) || !canAffordAt(map, player, tile, BUILDING_COSTS.port)) continue;
      candidates.push({ score: LINK_SCORE + jitter(), action: { type: AiActionType.BUILD, q: tile.q, r: tile.r, kind: BuildingKind.PORT } });
    }
    const front = links.enemyRoad;
    if (front && !state.built.has(key(front.q, front.r)) && canBuildRoad(map, front, player)) {
      candidates.push({ score: ENEMY_ROAD_SCORE + jitter(), action: { type: AiActionType.BUILD_ROAD, q: front.q, r: front.r } });
    }
  }
}
