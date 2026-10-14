import { describe, expect, it } from 'vitest';
import { makeStyledLabel } from '../src/gfx/text-styles';
import { FontSize, TextStyle } from '@enums';

describe('makeStyledLabel', () => {
  it('applies the H1 preset and lets overrides win', () => {
    const h1 = makeStyledLabel('Title', TextStyle.H1);
    expect(h1.style.fontSize).toBe(FontSize.BIG);
    expect(h1.style.fill).toBe(0xffffff);
    expect(makeStyledLabel('Title', TextStyle.H1, { fill: 0x123456 }).style.fill).toBe(0x123456);
    expect(makeStyledLabel('Mode', TextStyle.H2).style.fontSize).toBe(FontSize.NORMAL);
  });
});
