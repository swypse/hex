import { describe, expect, it } from 'vitest';
import { GameEventType } from '@enums';
import type { GameEvent } from '../src/game/events';
import { INCOME_BADGE_DELAY_MS, incomeBadgeDelays } from '../src/controller/income-order';

const income = (over: Partial<Extract<GameEvent, { type: GameEventType.INCOME }>>): GameEvent => ({
  type: GameEventType.INCOME,
  playerIndex: 0,
  q: 0,
  r: 0,
  ...over,
});

describe('income badge order', () => {
  it('starts food first, then wood/stone/ore, then money, one delay apart', () => {
    const money = income({ money: 5 });
    const wood = income({ wood: 2 });
    const mine = income({ stone: 1, ore: 1 });
    const food = income({ food: 3 });
    const delays = incomeBadgeDelays([money, wood, mine, food], 0);
    expect(delays.get(food)).toBe(0);
    expect(delays.get(wood)).toBe(INCOME_BADGE_DELAY_MS);
    expect(delays.get(mine)).toBe(2 * INCOME_BADGE_DELAY_MS);
    expect(delays.get(money)).toBe(3 * INCOME_BADGE_DELAY_MS);
  });

  it('only schedules the badges of the given player', () => {
    const own = income({ money: 1 });
    const other = income({ playerIndex: 1, money: 1 });
    const delays = incomeBadgeDelays([other, own], 0);
    expect(delays.has(other)).toBe(false);
    expect(delays.get(own)).toBe(0);
  });
});
