import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BitmapFontManager } from 'pixi.js';
import { enableSizedFonts, FONT_BLACK, FONT_REGULAR, prewarmSizedFonts, sizedFontFamily } from '../src/gfx/bitmap-fonts';
import { storageService } from '../src/storage/storage-service';
import { FontSize } from '@enums';

describe('prewarmSizedFonts', () => {
  let install: { mock: { calls: unknown[][] } };

  beforeEach(() => {
    install = vi.spyOn(BitmapFontManager, 'install').mockImplementation((() => ({})) as never) as unknown as typeof install;
    vi.spyOn(storageService, 'getItem').mockReturnValue(JSON.stringify([[FONT_BLACK, 36]]));
    vi.spyOn(storageService, 'setItem').mockImplementation(() => {});
    enableSizedFonts();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bakes every seed size and every size learned from earlier sessions, one per idle period', async () => {
    let idles = 0;
    await prewarmSizedFonts(async () => {
      idles++;
    });
    const names = install.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(names).toContain(`${FONT_REGULAR}@14`);
    expect(names).toContain(`${FONT_REGULAR}@42`);
    expect(names).toContain(`${FONT_BLACK}@36`); // learned (on the scale, not a seed)
    expect(idles).toBe(11); // 4 sizes x 2 weights + 2 baked skill-tree sizes + 1 learned
    expect(names).toHaveLength(11);
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes a later request for a prewarmed size free', async () => {
    await prewarmSizedFonts(async () => {});
    const before = install.mock.calls.length;
    expect(sizedFontFamily(FONT_REGULAR, FontSize.SMALL)).toBe(`${FONT_REGULAR}@14`);
    expect(install.mock.calls.length).toBe(before);
  });
});

describe('learned font sizes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores and prunes stored sizes that are not on the FontSize scale', async () => {
    const install = vi.spyOn(BitmapFontManager, 'install').mockImplementation((() => ({})) as never) as unknown as { mock: { calls: unknown[][] } };
    const stored = JSON.stringify([[FONT_REGULAR, 10], [FONT_BLACK, 27]]);
    vi.spyOn(storageService, 'getItem').mockReturnValue(stored);
    const setItem = vi.spyOn(storageService, 'setItem').mockImplementation(() => {});
    enableSizedFonts();
    await prewarmSizedFonts(async () => {});
    const names = install.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(names).not.toContain(`${FONT_REGULAR}@10`);
    expect(names).not.toContain(`${FONT_BLACK}@27`);
    expect(setItem).toHaveBeenCalledWith('hex-font-sizes-v1', '[]');
  });
});
