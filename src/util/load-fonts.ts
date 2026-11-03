import { enableSizedFonts, loadBitmapFonts } from '../gfx/bitmap-fonts';

export async function loadFonts() {
  await Promise.all([
    document.fonts.load('16px "Roboto"'),
    document.fonts.load('800 16px "Roboto"'),
  ]);
  await loadBitmapFonts();
  enableSizedFonts();
}
