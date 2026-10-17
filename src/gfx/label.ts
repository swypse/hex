import { BitmapText, type TextStyleFontWeight, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';
import { fontFamilyForWeight, sizedFontFamily } from './bitmap-fonts';
import { FontSize } from '@enums';

/** Line height of multi-line body text in popups (multiple of the font size). */
export const BODY_LINE_HEIGHT = 1.45;

export function makeLabel(
  text: string,
  opts: {
    /** One of the shared text sizes; see `FontSize`. */
    fontSize?: FontSize;
    fill?: number;
    fontWeight?: TextStyleFontWeight;
    anchor?: [number, number];
    wordWrap?: boolean;
    wordWrapWidth?: number;
    /** Line height as a multiple of the font size (see `BODY_LINE_HEIGHT`). */
    lineHeight?: number;
    /** Bakes the glyphs this many times larger and scales the label back down,
     *  so text inside a container that gets magnified stays sharp. */
    bake?: number;
    /** Snaps the glyph quads to whole device pixels. On by default: UI cards
     *  and scrolled content sit at fractional offsets, which resamples the
     *  glyphs and blurs them. Turn off for text that glides across the map. */
    roundPixels?: boolean;
  } = {},
): BitmapText {
  const bake = Math.max(1, opts.bake ?? 1);
  const fontSize = (opts.fontSize ?? FontSize.NORMAL) * bake;
  const style: TextStyleOptions = {
    fontFamily: sizedFontFamily(fontFamilyForWeight(opts.fontWeight), fontSize),
    fontSize,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.lineHeight) style.lineHeight = Math.round(fontSize * opts.lineHeight);
  if (opts.wordWrap) {
    style.wordWrap = true;
    style.wordWrapWidth = (opts.wordWrapWidth ?? 200) * bake;
  }
  const label = new BitmapText({ text, style, roundPixels: opts.roundPixels ?? true });
  if (bake > 1) label.scale.set(1 / bake);
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
