import { describe, it, expect } from 'vitest';
import { pauseAfterEvent } from '../src/controller/event-presenter';
import type { GameEvent } from '../src/game/events';

const seen = () => true;
const fogged = () => false;
const move: GameEvent = { type: 'unitMoved', unitId: 'u1', from: { q: 0, r: 0 }, path: [{ q: 1, r: 0 }], to: { q: 1, r: 0 } };

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
    const own: GameEvent = { type: 'bonusClaimed', q: 1, r: 1, kind: 'money', playerIndex: 0 };
    expect(pauseAfterEvent(own, 0, fogged)).toBe(150);
  });

  it('never waits after state-only events', () => {
    expect(pauseAfterEvent({ type: 'aiTurn', playerIndex: 1 } as GameEvent, 0, seen)).toBe(0);
    expect(pauseAfterEvent({ type: 'spawned', unitType: 'warrior', q: 0, r: 0, playerIndex: 1 }, 0, seen)).toBe(0);
  });
});
