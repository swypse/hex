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
  } = {},
): BitmapText {
  const fontSize = opts.fontSize ?? 16;
  const style: TextStyleOptions = {
    fontFamily: sizedFontFamily(fontFamilyForWeight(opts.fontWeight), fontSize),
    fontSize,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.wordWrap) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth ?? 200;
  }
  const label = new BitmapText({ text, style });
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
