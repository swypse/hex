import { Assets, BitmapFontManager, type BitmapFont, type TextStyleFontWeight } from 'pixi.js';
import { FontSize } from '@enums';
import { storageService } from '../storage/storage-service';
import { forEachIdle } from '../util/time-slice';

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

/** Text sizes the UI may use, most used first (see `FontSize`). */
const SCALE_SIZES: readonly FontSize[] = [FontSize.SMALL, FontSize.NORMAL, FontSize.VERY_SMALL, FontSize.BIG];
/** Largest `bake` multiplier a label uses (the skill tree bakes its text 3x). */
const MAX_BAKE = 3;

/** Sized fonts to bake ahead of time: every scale size in both weights, plus the
 *  3x variants the magnified skill tree uses. Anything else the game asks for is
 *  baked on first use and remembered for the next start-up. */
const SEED_FONT_SIZES: readonly (readonly [string, number])[] = [
  ...SCALE_SIZES.flatMap((size): [string, number][] => [[FONT_REGULAR, size], [FONT_BLACK, size]]),
  [FONT_REGULAR, FontSize.VERY_SMALL * MAX_BAKE],
  [FONT_REGULAR, FontSize.SMALL * MAX_BAKE],
];
const LEARNED_SIZES_KEY = 'hex-font-sizes-v1';

/** Whether `size` is a `FontSize` or a `bake` multiple of one. */
function isScaleSize(size: number): boolean {
  return SCALE_SIZES.some((s) => Array.from({ length: MAX_BAKE }, (_, i) => s * (i + 1)).includes(size));
}

/** Sizes remembered from earlier sessions. Sizes that are no longer on the scale
 *  (saved before the scale existed, or by a bug) are dropped, and dropped from
 *  storage too, so they are never baked ahead of time. */
function learnedFontSizes(): [string, number][] {
  try {
    const raw = storageService.getItem(LEARNED_SIZES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const valid = parsed.filter((e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number');
    const onScale = valid.filter(([, size]) => isScaleSize(size));
    if (onScale.length !== parsed.length) storageService.setItem(LEARNED_SIZES_KEY, JSON.stringify(onScale));
    return onScale;
  } catch {
    return [];
  }
}

/** Remembers a size that was not in the seed list, so the next start-up bakes
 *  it ahead of time too. Off-scale sizes are a bug to fix, not to remember.
 *  Best effort: storage may be unavailable. */
function rememberFontSize(family: string, size: number): void {
  if (!isScaleSize(size)) return;
  if (SEED_FONT_SIZES.some(([f, s]) => f === family && s === size)) return;
  try {
    const known = learnedFontSizes();
    if (known.some(([f, s]) => f === family && s === size)) return;
    storageService.setItem(LEARNED_SIZES_KEY, JSON.stringify([...known, [family, size]]));
  } catch {
    // ignore
  }
}

/** Bakes the sized fonts the game will need, one per idle period, so entering
 *  the game screen finds them ready instead of rasterising a dozen glyph atlases
 *  in one task. Safe to call any time after `enableSizedFonts`; sizes already
 *  baked cost nothing. */
export function prewarmSizedFonts(idle?: () => Promise<void>): Promise<void> {
  const wanted: [string, number][] = [...SEED_FONT_SIZES.map(([f, s]): [string, number] => [f, s]), ...learnedFontSizes()];
  return forEachIdle(wanted, ([family, size]) => void sizedFontFamily(family, size), idle);
}

let sizedFontsEnabled = false;

/** Turns on per-size font baking (see `sizedFontFamily`). Called once from the
 *  app boot -> loadFonts, after the CSS Roboto faces have loaded; left off in tests, which
 *  have no canvas to rasterise glyphs with. */
export function enableSizedFonts(): void {
  sizedFontsEnabled = true;
}

const warnedSizes = new Set<number>();

/** Dev aid: every extra size costs another baked font per weight, so say so when
 *  a label asks for something that is not a `FontSize` (times a bake factor). */
function warnIfOffScale(size: number): void {
  if (!import.meta.env.DEV || warnedSizes.has(size) || isScaleSize(size)) return;
  warnedSizes.add(size);
  console.warn(`[fonts] ${size}px is not on the FontSize scale; use a FontSize so no extra font is baked`);
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
  warnIfOffScale(size);
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
  rememberFontSize(family, size);
  return resolved;
}
