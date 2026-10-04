import { describe, it, expect } from 'vitest';
import { pauseAfterEvent } from '../src/controller/event-presenter';
import type { GameEvent } from '../src/game/events';
import { BonusKind, GameEventType, UnitType } from '@enums';

const seen = () => true;
const fogged = () => false;
const move: GameEvent = { type: GameEventType.UNIT_MOVED, unitId: 'u1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 } };

describe('pauseAfterEvent', () => {
  it('does not wait after events inside fog', () => {
    expect(pauseAfterEvent(move, 0, fogged)).toBe(0);
  });

  it('waits only briefly after a visible enemy action', () => {
    const ms = pauseAfterEvent(move, 0, seen);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThan(150);
  });

  it('keeps the full beat after the local player\'s own events', () => {
    const own: GameEvent = { type: GameEventType.BONUS_CLAIMED, q: 1, r: 1, kind: BonusKind.MONEY, playerIndex: 0 };
    expect(pauseAfterEvent(own, 0, fogged)).toBe(150);
  });

  it('never waits after state-only events', () => {
    expect(pauseAfterEvent({ type: GameEventType.AI_TURN, playerIndex: 1 } as GameEvent, 0, seen)).toBe(0);
    expect(pauseAfterEvent({ type: GameEventType.SPAWNED, unitType: UnitType.WARRIOR, q: 0, r: 0, playerIndex: 1 }, 0, seen)).toBe(0);
  });
});
