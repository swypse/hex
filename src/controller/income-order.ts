import { GameEventType } from '@enums';
import type { GameEvent } from '../game/events';

/** Delay between the start of two consecutive income badges. */
export const INCOME_BADGE_DELAY_MS = 120;

type IncomeEvent = Extract<GameEvent, { type: GameEventType.INCOME }>;

/** Display rank of an income badge: food first, then wood/stone/ore, money last. */
function incomeRank(e: IncomeEvent): number {
  if ((e.food ?? 0) > 0) return 0;
  if ((e.money ?? 0) > 0) return 2;
  return 1;
}

/** Start delay (ms) of every income badge of `playerIndex` in a batch: the
 *  badges start one after another, food first, then materials, then money,
 *  each `INCOME_BADGE_DELAY_MS` after the previous one. */
export function incomeBadgeDelays(events: readonly GameEvent[], playerIndex: number): Map<GameEvent, number> {
  const badges = events.filter((e): e is IncomeEvent => e.type === GameEventType.INCOME && e.playerIndex === playerIndex);
  const ordered = badges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => incomeRank(a.e) - incomeRank(b.e) || a.i - b.i);
  return new Map(ordered.map(({ e }, n) => [e, n * INCOME_BADGE_DELAY_MS]));
}
