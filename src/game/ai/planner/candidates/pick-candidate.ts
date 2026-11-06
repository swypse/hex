import { AiPickMode } from '@enums';
import type { AiAction } from '../../types/action';
import type { Candidate } from './candidate';
import type { CandidateContext } from './candidate-context';

/** Picks the best candidate (or a random one on easy difficulty). */
export function pickCandidate(ctx: CandidateContext, candidates: Candidate[], source?: { kind: AiPickMode }): AiAction[] | null {
  const { rng, difficulty } = ctx;
  if (difficulty && difficulty.mistakeChance > 0 && candidates.length > 0 && rng.next() < difficulty.mistakeChance) {
    if (source) source.kind = AiPickMode.RANDOM;
    const pick = candidates[Math.floor(rng.next() * candidates.length)]!;
    return Array.isArray(pick.action) ? pick.action : [pick.action];
  }

  if (candidates.length === 0) return null;
  if (source) source.kind = AiPickMode.BEST;
  let best = candidates[0]!;
  for (const c of candidates) if (c.score > best.score) best = c;
  return Array.isArray(best.action) ? best.action : [best.action];
}
