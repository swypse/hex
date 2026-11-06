import { AiActionType } from '@enums';
import { canBuildRoad, villageConnectedNodes } from '../../../economy/roads';
import { isExploredFor } from '../../../map/explore';
import { hexNeighbors } from '../../../map/hex';
import { tileAt } from '../../../map/tile-index';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Roads that extend the network toward unexplored ground or a foreign village. */
export function roadCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, jitter } = ctx;
  const roadConnected = villageConnectedNodes(map, player.index);
  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildRoad(map, tile, player, roadConnected)) continue;
    if (tile.unit && tile.unit.owner !== player.index) continue;
    // Only extend the road network where it pushes toward unexplored ground or
    // a foreign village (roads grant +1 movement, speeding up expansion).
    const pushesForward = hexNeighbors(tile).some((n) => {
      const nt = tileAt(map, n.q, n.r);
      if (!nt) return false;
      if (!isExploredFor(nt, player.index)) return true;
      return nt.settlement !== null && nt.settlement.owner !== player.index;
    });
    if (!pushesForward) continue;
    candidates.push({ score: 150 + jitter(), action: { type: AiActionType.BUILD_ROAD, q: tile.q, r: tile.r } });
  }
}
