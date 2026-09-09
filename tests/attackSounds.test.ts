import { describe, expect, it } from 'vitest';
import { attackSound } from '../src/sound/attackSounds';

describe('attackSound', () => {
  it('gives an archer a launch on every shot and a hit impact when it lands', () => {
    expect(attackSound('archer', false)).toEqual({ launch: 'arcShot', impact: 'hit' });
  });

  it('keeps the archer launch on a missed shot with no impact', () => {
    expect(attackSound('archer', true)).toEqual({ launch: 'arcShot' });
  });

  it('gives a swordsman landed attack a sword-hit instead of the generic hit', () => {
    expect(attackSound('swordsman', false)).toEqual({ impact: 'swordHit' });
  });

  it('gives a knight landed attack a sword-hit instead of the generic hit', () => {
    expect(attackSound('knight', false)).toEqual({ impact: 'swordHit' });
  });

  it('keeps sword-wielding misses silent', () => {
    expect(attackSound('swordsman', true)).toEqual({});
    expect(attackSound('knight', true)).toEqual({});
  });

  it('keeps the generic hit for other landed attacks', () => {
    for (const type of ['warrior', 'rider', 'shield', 'catapult', 'pirate'] as const) {
      expect(attackSound(type, false)).toEqual({ impact: 'hit' });
    }
  });

  it('keeps other misses silent', () => {
    expect(attackSound('warrior', true)).toEqual({});
    expect(attackSound('catapult', true)).toEqual({});
  });

  it('degrades an unknown attacker type to the generic hit when it lands', () => {
    expect(attackSound(undefined, false)).toEqual({ impact: 'hit' });
    expect(attackSound(undefined, true)).toEqual({});
  });

  it('uses the generic hit for a landed ship attack whatever the crew type', () => {
    for (const type of ['archer', 'swordsman', 'knight', 'warrior', 'shield'] as const) {
      expect(attackSound(type, false, true)).toEqual({ impact: 'hit' });
    }
  });

  it('never plays a crew launch sound for a ship', () => {
    expect(attackSound('archer', false, true)).not.toHaveProperty('launch');
    expect(attackSound('archer', true, true)).toEqual({});
    expect(attackSound('swordsman', true, true)).toEqual({});
  });
});
