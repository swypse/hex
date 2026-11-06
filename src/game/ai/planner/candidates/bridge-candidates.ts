import { AiActionType } from '@enums';
import { BRIDGE_COST, canBuildBridge } from '../../../economy/bridges';
import { canAffordAt } from '../../../economy/stock';
import { hexNeighbors } from '../../../map/hex';
import { tileAt } from '../../../map/tile-index';
import { bridgeLeadsSomewhere } from '../../economy/bridge-leads-somewhere';
import { key } from '../../util/tile-key';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Bridges that lead somewhere worth crossing for. */
export function bridgeCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  const { map, player, state, situation, jitter, buildScale } = ctx;
  for (const tile of map.tiles) {
    if (state.built.has(key(tile.q, tile.r))) continue;
    if (!canBuildBridge(map, tile, player)) continue;
    if (!canAffordAt(map, player, tile, BRIDGE_COST)) continue;
    // While a naval threat is active, spend on the naval response instead.
    if (situation?.navalThreat) continue;
    const touchesOwnNetwork = hexNeighbors(tile).some((n) => {
      const t = tileAt(map, n.q, n.r);
      return t !== undefined && (t.ownedBy === player.index || t.roadOwner === player.index);
    });
    if (!touchesOwnNetwork) continue;
    if (!bridgeLeadsSomewhere(map, tile, player)) continue;
    candidates.push({ score: (250 * buildScale) + jitter(), action: { type: AiActionType.BUILD_BRIDGE, q: tile.q, r: tile.r } });
  }
}
