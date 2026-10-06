import { describe, expect, it } from 'vitest';
import { ENEMY_GLOW_COLOR, OWN_GLOW_COLOR, unitGlowColor } from '../src/render/unit-glow-color';
import { PIRATE_OWNER } from '../src/game/units/units';
import { UnitType } from '@enums';

describe('unitGlowColor', () => {
  it('keeps the normal glow for the local player\'s own unit', () => {
    expect(unitGlowColor({ owner: 0, type: UnitType.WARRIOR }, 0)).toBe(OWN_GLOW_COLOR);
  });

  it('glows red for a unit of another player', () => {
    expect(unitGlowColor({ owner: 2, type: UnitType.ARCHER }, 0)).toBe(ENEMY_GLOW_COLOR);
  });

  it('glows red for a pirate ship without a deal, and for one that only has a deal with someone else', () => {
    expect(unitGlowColor({ owner: PIRATE_OWNER, type: UnitType.PIRATE }, 0)).toBe(ENEMY_GLOW_COLOR);
    expect(unitGlowColor({ owner: PIRATE_OWNER, type: UnitType.PIRATE, paidBy: [3] }, 0)).toBe(ENEMY_GLOW_COLOR);
  });

  it('keeps the normal glow for a pirate ship with an active deal with the local player', () => {
    expect(unitGlowColor({ owner: PIRATE_OWNER, type: UnitType.PIRATE, paidBy: [3, 0] }, 0)).toBe(OWN_GLOW_COLOR);
  });
});
