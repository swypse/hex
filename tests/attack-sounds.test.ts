import { describe, expect, it } from 'vitest';
import { attackSound } from '../src/sound/attack-sounds';
import { AttackImpact, UnitType } from '@enums';

describe('attackSound', () => {
  it('gives an archer a launch on every shot and a hit impact when it lands', () => {
    expect(attackSound(UnitType.ARCHER, false)).toEqual({ launch: 'arcShot', impact: AttackImpact.HIT });
  });

  it('keeps the archer launch on a missed shot with no impact', () => {
    expect(attackSound(UnitType.ARCHER, true)).toEqual({ launch: 'arcShot' });
  });

  it('gives a swordsman landed attack a sword-hit instead of the generic hit', () => {
    expect(attackSound(UnitType.SWORDSMAN, false)).toEqual({ impact: AttackImpact.SWORD_HIT });
  });

  it('gives a knight landed attack a sword-hit instead of the generic hit', () => {
    expect(attackSound(UnitType.KNIGHT, false)).toEqual({ impact: AttackImpact.SWORD_HIT });
  });

  it('keeps sword-wielding misses silent', () => {
    expect(attackSound(UnitType.SWORDSMAN, true)).toEqual({});
    expect(attackSound(UnitType.KNIGHT, true)).toEqual({});
  });

  it('keeps the generic hit for other landed attacks', () => {
    for (const type of [UnitType.WARRIOR, UnitType.RIDER, UnitType.SHIELD, UnitType.CATAPULT, UnitType.PIRATE] as const) {
      expect(attackSound(type, false)).toEqual({ impact: AttackImpact.HIT });
    }
  });

  it('keeps other misses silent', () => {
    expect(attackSound(UnitType.WARRIOR, true)).toEqual({});
    expect(attackSound(UnitType.CATAPULT, true)).toEqual({});
  });

  it('degrades an unknown attacker type to the generic hit when it lands', () => {
    expect(attackSound(undefined, false)).toEqual({ impact: AttackImpact.HIT });
    expect(attackSound(undefined, true)).toEqual({});
  });

  it('uses the generic hit for a landed ship attack whatever the crew type', () => {
    for (const type of [UnitType.ARCHER, UnitType.SWORDSMAN, UnitType.KNIGHT, UnitType.WARRIOR, UnitType.SHIELD] as const) {
      expect(attackSound(type, false, true)).toEqual({ impact: AttackImpact.HIT });
    }
  });

  it('never plays a crew launch sound for a ship', () => {
    expect(attackSound(UnitType.ARCHER, false, true)).not.toHaveProperty('launch');
    expect(attackSound(UnitType.ARCHER, true, true)).toEqual({});
    expect(attackSound(UnitType.SWORDSMAN, true, true)).toEqual({});
  });
});
