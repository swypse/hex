import { Assets, BitmapFontManager, type BitmapFont, type TextStyleFontWeight } from 'pixi.js';

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
      // Sample a single nearest mip level instead of trilinear blending:
      // when the 72px bake is downscaled to 10-26px labels, blending two mip
      // levels softens glyph edges, so discontinuous mip selection reads as
      // crisper, sharper text.
      page.texture.source.mipmapFilter = 'nearest';
    }
  }
  return [regular, black];
}

/** Highest device pixel ratio worth baking glyphs for. */
const MAX_SIZED_RESOLUTION = 3;

const sizedFamilies = new Map<string, string>();
let sizedFontsEnabled = false;

/** Turns on per-size font baking (see `sizedFontFamily`). Called once from the
 *  app boot -> loadFonts, after the CSS Roboto faces have loaded; left off in tests, which
 *  have no canvas to rasterise glyphs with. */
export function enableSizedFonts(): void {
  sizedFontsEnabled = true;
}

/** Family name of a bitmap font baked for exactly `fontSize` CSS px at the
 *  device pixel ratio. The shipped 72px atlases look soft when shrunk 3-6x to
 *  12-26px labels; a font rasterised at its display size stays sharp. Fonts are
 *  installed lazily, one per (family, rounded size), from the CSS Roboto faces;
 *  glyphs outside ASCII (Cyrillic, symbols) are added on first use. Falls back to
 *  the shipped atlas when disabled or the bake fails. */
export function sizedFontFamily(family: string, fontSize: number): string {
  if (!sizedFontsEnabled) return family;
  const size = Math.max(1, Math.round(fontSize));
  const name = `${family}@${size}`;
  const known = sizedFamilies.get(name);
  if (known !== undefined) return known;
  let resolved = family;
  try {
    BitmapFontManager.install({
      name,
      style: {
        fontFamily: 'Roboto',
        fontWeight: family === FONT_BLACK ? '800' : '400',
        fontSize: size,
        fill: 0xffffff,
      },
      chars: [[' ', '~']],
      resolution: Math.min(MAX_SIZED_RESOLUTION, Math.max(1, window.devicePixelRatio || 1)),
      padding: 2,
    });
    resolved = name;
  } catch {
    // keep the shipped atlas
  }
  sizedFamilies.set(name, resolved);
  return resolved;
}
