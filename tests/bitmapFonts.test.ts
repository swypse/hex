import { describe, expect, it, vi } from 'vitest';
import { Assets } from 'pixi.js';
import { FONT_BLACK, FONT_REGULAR, fontFamilyForWeight, loadBitmapFonts } from '../src/ui/kit/bitmapFonts';

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

describe('loadBitmapFonts', () => {
  it('enables mipmaps on every loaded font page so downscaled text stays antialiased', async () => {
    const sourceA = { autoGenerateMipmaps: false };
    const sourceB = { autoGenerateMipmaps: false };
    const fontA = { pages: [{ texture: { source: sourceA } }] };
    const fontB = { pages: [{ texture: { source: sourceB } }] };
    vi.spyOn(Assets, 'load').mockImplementation(((url: string) =>
      Promise.resolve(url.toString().includes('Black') ? fontB : fontA)) as never);

    await loadBitmapFonts();

    expect(sourceA.autoGenerateMipmaps).toBe(true);
    expect(sourceB.autoGenerateMipmaps).toBe(true);
  });
});