import { describe, expect, it } from 'vitest';
import {
  TIP_TEXTS,
  currentTipText,
  initialTipsProgress,
  isTipsExhausted,
  tipsDueTurn,
} from '../src/ui/hud/tips';

describe('tips module', () => {
  it('defines the five tip strings', () => {
    expect(TIP_TEXTS).toHaveLength(5);
    expect(TIP_TEXTS[0]).toBe('Attacks can miss. Open the Science skill to make your attacks more precise.');
    expect(TIP_TEXTS[4]).toBe('Build mines on mountains to gather stone and ore — you need them to upgrade villages.');
  });

  it('uses the rng to shuffle the display order', () => {
    const p = initialTipsProgress(() => 0);
    expect(p.order).toEqual([1, 2, 3, 4, 0]);
  });

  it('is due at turn 3 before anything has been closed', () => {
    expect(tipsDueTurn(initialTipsProgress(() => 0))).toBe(3);
  });

  it('is due two turns after the last close', () => {
    const p = initialTipsProgress(() => 0);
    p.closedAtTurn = 7;
    expect(tipsDueTurn(p)).toBe(9);
  });

  it('reports the current tip until it is exhausted', () => {
    const p = initialTipsProgress(() => 0);
    expect(isTipsExhausted(p)).toBe(false);
    expect(currentTipText(p)).toBe(TIP_TEXTS[1]!);
    p.pointer = p.order.length;
    expect(isTipsExhausted(p)).toBe(true);
    expect(currentTipText(p)).toBeNull();
  });
});
