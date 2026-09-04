import { describe, it, expect } from 'vitest';
import { GameEvent } from '../src/game/events';
import { initialAttackHpOverrides, hpOverrideAfterAttack } from '../src/controller/attackHp';

function attack(over: Partial<GameEvent>): GameEvent {
  return {
    type: 'attack', attackerId: 'a', targetId: 'b',
    attackerIndex: 0, targetIndex: 1,
    attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
    attackerDamage: 0, targetDamage: 0, missed: false,
    attackerDied: false, targetDied: false,
    attackerPre: { type: 'warrior', owner: 0, hp: 5 },
    targetPre: { type: 'warrior', owner: 1, hp: 5 },
    ...over,
  } as GameEvent;
}

describe('attack hp presentation plan', () => {
  it('shows pre-batch hp for every unit involved in an attack', () => {
    const events = [
      attack({ attackerId: 'a', targetId: 'b', attackerPre: { type: 'warrior', owner: 0, hp: 4 }, targetPre: { type: 'warrior', owner: 1, hp: 3 } }),
    ];
    expect(initialAttackHpOverrides(events)).toEqual(
      new Map([['a', 4], ['b', 3]]),
    );
  });

  it('uses the hp of the first involvement when a unit is hit twice in a batch', () => {
    const events = [
      attack({ attackerId: 'x', targetId: 'b', attackerPre: { type: 'warrior', owner: 2, hp: 5 }, targetPre: { type: 'warrior', owner: 1, hp: 7 } }),
      attack({ attackerId: 'y', targetId: 'b', attackerPre: { type: 'warrior', owner: 2, hp: 5 }, targetPre: { type: 'warrior', owner: 1, hp: 5 } }),
    ];
    // b is full at 7 until the first hit lands.
    expect(initialAttackHpOverrides(events).get('b')).toBe(7);
    // After the first hit b must show its pre-hp for the second hit (5).
    const after = hpOverrideAfterAttack(events, 0);
    expect(after.find((s) => s.unitId === 'b')).toEqual({ unitId: 'b', hp: 5 });
  });

  it('clears the override (real sim hp) after the last attack on a unit', () => {
    const events = [
      attack({ attackerId: 'a', targetId: 'b' }),
      attack({ attackerId: 'c', targetId: 'd' }),
    ];
    expect(hpOverrideAfterAttack(events, 0)).toEqual([
      { unitId: 'a', hp: null },
      { unitId: 'b', hp: null },
    ]);
  });
});
