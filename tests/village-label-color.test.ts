import { describe, expect, it } from 'vitest';
import { Tribe, TRIBES } from '../src/game/tribes';
import { villageLabelTextColor } from '../src/render/village-label-color';

describe('villageLabelTextColor', () => {
  it('is black only for the Sand people tribe, white for every other known tribe', () => {
    for (const tribe of TRIBES) {
      expect(villageLabelTextColor(tribe, true)).toBe(tribe.id === Tribe.Sand ? 0x000000 : 0xffffff);
    }
  });

  it('uses plain contrast on the neutral plate of a tribe not met yet', () => {
    const cats = TRIBES.find((t) => t.id === Tribe.Cats)!;
    const sand = TRIBES.find((t) => t.id === Tribe.Sand)!;
    // the neutral plate does not depend on whose village it is
    expect(villageLabelTextColor(cats, false)).toBe(villageLabelTextColor(sand, false));
  });
});
