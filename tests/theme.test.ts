import { describe, it, expect } from 'vitest';
import { THEME, parseHexColor, colorCss, isLightColor } from '../src/ui/kit/theme';

describe('theme helpers', () => {
  it('parses hex colors', () => {
    expect(parseHexColor('#ff69b4')).toBe(0xff69b4);
    expect(parseHexColor('junk')).toBe(0x1a1a2e);
  });
  it('formats css colors', () => {
    expect(colorCss(0xff69b4)).toBe('#ff69b4');
    expect(colorCss(0x0a0b0c)).toBe('#0a0b0c');
  });
  it('detects light colors', () => {
    expect(isLightColor(0xf2f2f7)).toBe(true);
    expect(isLightColor(0x2f6fb3)).toBe(false);
  });
  it('buttonPressed is darker than buttonHover', () => {
    expect(THEME.buttonPressed).toBe(0x2f3450);
    expect(THEME.buttonPressed).toBeLessThan(THEME.buttonHover);
  });
  it('uses the Roboto custom font', () => {
    expect(THEME.fontFamily).toBe('Roboto, system-ui, sans-serif');
  });
});
