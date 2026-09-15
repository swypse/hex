import { Assets, type BitmapFont, type TextStyleFontWeight } from 'pixi.js';

export const FONT_REGULAR = 'Roboto Regular';
export const FONT_BLACK = 'Roboto Black';

const FONT_BASE = `${import.meta.env.BASE_URL}fonts/`;

export function fontFamilyForWeight(weight?: TextStyleFontWeight): string {
  if (!weight) return FONT_REGULAR;
  if (weight === 'bold') return FONT_BLACK;
  const n = Number(weight);
  if (!Number.isNaN(n) && n >= 700) return FONT_BLACK;
  return FONT_REGULAR;
}

export async function loadBitmapFonts(): Promise<unknown> {
  const [regular, black] = await Promise.all([
    Assets.load<BitmapFont>(`${FONT_BASE}Roboto Regular.fnt`),
    Assets.load<BitmapFont>(`${FONT_BASE}Roboto Black.fnt`),
  ]);
  for (const font of [regular, black]) {
    for (const page of font.pages) {
      page.texture.source.autoGenerateMipmaps = true;
    }
  }
  return [regular, black];
}
