import { describe, expect, it } from 'vitest';
import { FONT_BLACK, FONT_REGULAR, fontFamilyForWeight } from '../src/ui/kit/bitmapFonts';

describe('fontFamilyForWeight', () => {
  it('maps undefined and normal weights to Roboto Regular', () => {
    expect(fontFamilyForWeight(undefined)).toBe(FONT_REGULAR);
    expect(fontFamilyForWeight('normal')).toBe(FONT_REGULAR);
    expect(fontFamilyForWeight('600')).toBe(FONT_REGULAR);
  });
  it('maps bold and 700+ to Roboto Black', () => {
    expect(fontFamilyForWeight('bold')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('700')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('800')).toBe(FONT_BLACK);
    expect(fontFamilyForWeight('900')).toBe(FONT_BLACK);
  });
});
