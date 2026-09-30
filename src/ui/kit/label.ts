import { BitmapText, type TextStyleFontWeight, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';
import { fontFamilyForWeight, sizedFontFamily } from './bitmap-fonts';

export function makeLabel(
  text: string,
  opts: {
    fontSize?: number;
    fill?: number;
    fontWeight?: TextStyleFontWeight;
    anchor?: [number, number];
    wordWrap?: boolean;
    wordWrapWidth?: number;
    /** Bakes the glyphs this many times larger and scales the label back down,
     *  so text inside a container that gets magnified stays sharp. */
    bake?: number;
  } = {},
): BitmapText {
  const bake = Math.max(1, opts.bake ?? 1);
  const fontSize = (opts.fontSize ?? 16) * bake;
  const style: TextStyleOptions = {
    fontFamily: sizedFontFamily(fontFamilyForWeight(opts.fontWeight), fontSize),
    fontSize,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.wordWrap) {
    style.wordWrap = true;
    style.wordWrapWidth = (opts.wordWrapWidth ?? 200) * bake;
  }
  const label = new BitmapText({ text, style });
  if (bake > 1) label.scale.set(1 / bake);
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
