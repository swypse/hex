import { describe, it, expect } from 'vitest';
import { contrastTextColor, relativeLuminance } from '../src/ui/kit/theme';
import { TRIBES } from '../src/game/tribes';

describe('contrastTextColor', () => {
  it('uses black on light backgrounds and white on dark ones', () => {
    expect(contrastTextColor(0xffffff)).toBe(0x000000);
    expect(contrastTextColor(0xf2e6a0)).toBe(0x000000);
    expect(contrastTextColor(0x000000)).toBe(0xffffff);
    expect(contrastTextColor(0x1a1a2e)).toBe(0xffffff);
  });

  it('computes WCAG luminance extremes', () => {
    expect(relativeLuminance(0x000000)).toBe(0);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 5);
  });

  it('always picks the colour with the higher contrast ratio, for every tribe', () => {
    const ratio = (a: number, b: number): number => {
      const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const tribe of TRIBES) {
      const chosen = contrastTextColor(tribe.color);
      const other = chosen === 0x000000 ? 0xffffff : 0x000000;
      expect(ratio(tribe.color, chosen)).toBeGreaterThanOrEqual(ratio(tribe.color, other));
    }
  });
});
