import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';
import { spawnCandidate } from './spawn-candidate';
import { upgradeCandidate } from './upgrade-candidate';

export function villageCandidates(ctx: CandidateContext, candidates: Candidate[]): void {
  for (const v of ctx.map.tiles) {
    if (!v.settlement || v.settlement.owner !== ctx.player.index) continue;
    upgradeCandidate(ctx, v, candidates);
    spawnCandidate(ctx, v, candidates);
  }
}
