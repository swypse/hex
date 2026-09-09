import { describe, expect, it } from 'vitest';
import { attackPresenceParticipants } from '../src/controller/attackPresence';
import { type GameEvent } from '../src/game/events';

function attack(over: Partial<Extract<GameEvent, { type: 'attack' }>>): GameEvent {
  return {
    type: 'attack',
    attackerId: 'att', targetId: 'def',
    attackerIndex: 0, targetIndex: 1,
    attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
    attackerDamage: 5, targetDamage: 0, missed: false,
    attackerDied: false, targetDied: false,
    attackerPre: { type: 'warrior', owner: 0, hp: 50 },
    targetPre: { type: 'warrior', owner: 1, hp: 50 },
    ...over,
  };
}

describe('attackPresenceParticipants', () => {
  it('collects a target killed later in the batch at its tile', () => {
    const events = [
      attack({
        targetId: 'mine',
        targetDied: true,
        attackerPre: { type: 'archer', owner: 0, hp: 30 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      }),
    ];
    expect(attackPresenceParticipants(events)).toEqual(
      new Map([['mine', { unitId: 'mine', tile: { q: 1, r: 0 }, pre: { type: 'warrior', owner: 0, hp: 50 } }]]),
    );
  });

  it('collects an attacker that dies while attacking', () => {
    const events = [attack({ attackerDied: true, attackerPre: { type: 'swordsman', owner: 0, hp: 80 } })];
    expect(attackPresenceParticipants(events)).toEqual(
      new Map([['att', { unitId: 'att', tile: { q: 0, r: 0 }, pre: { type: 'swordsman', owner: 0, hp: 80 } }]]),
    );
  });

  it('keeps a melee attacker that advances onto its kill on its own tile too', () => {
    const events = [
      attack({
        targetId: 'mine',
        targetDied: true,
        attackerPre: { type: 'swordsman', owner: 1, hp: 80 },
        targetPre: { type: 'warrior', owner: 0, hp: 50 },
      }),
    ];
    const out = attackPresenceParticipants(events);
    expect(out.get('mine')).toEqual({ unitId: 'mine', tile: { q: 1, r: 0 }, pre: { type: 'warrior', owner: 0, hp: 50 } });
    expect(out.get('att')).toEqual({ unitId: 'att', tile: { q: 0, r: 0 }, pre: { type: 'swordsman', owner: 1, hp: 80 } });
  });

  it('does not stage a ranged or ship attacker that stays on its tile', () => {
    const ranged = attack({
      targetDied: true,
      attackerPre: { type: 'archer', owner: 1, hp: 30 },
      targetPre: { type: 'warrior', owner: 0, hp: 50 },
    });
    const ship = attack({
      targetDied: true,
      attackerPre: { type: 'swordsman', owner: 1, hp: 80, shipLevel: 1 },
      targetPre: { type: 'warrior', owner: 0, hp: 50 },
    });
    for (const events of [[ranged], [ship]]) {
      const out = attackPresenceParticipants(events);
      expect(out.has('att')).toBe(false);
    }
  });

  it('ignores attacks where nobody dies', () => {
    expect(attackPresenceParticipants([attack({})]).size).toBe(0);
  });

  it('ignores a missed attack', () => {
    expect(attackPresenceParticipants([attack({ missed: true, targetDied: false, attackerDied: false })]).size).toBe(0);
  });

  it('keeps the first tile for a unit mentioned in several events', () => {
    const events = [
      attack({
        attackerPre: { type: 'archer', owner: 0, hp: 30 },
        targetId: 'a', targetDied: true, targetTile: { q: 1, r: 0 }, targetPre: { type: 'warrior', owner: 0, hp: 10 },
      }),
      attack({
        attackerPre: { type: 'archer', owner: 0, hp: 30 },
        targetId: 'a', targetDied: true, targetTile: { q: 2, r: 0 }, targetPre: { type: 'warrior', owner: 0, hp: 5 },
      }),
    ];
    const out = attackPresenceParticipants(events);
    expect(out.size).toBe(1);
    expect(out.get('a')!.tile).toEqual({ q: 1, r: 0 });
  });
});
