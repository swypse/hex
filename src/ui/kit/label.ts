import { Text, type TextStyleFontWeight, type TextStyleOptions } from 'pixi.js';
import { THEME } from './theme';

export function makeLabel(
  text: string,
  opts: { fontSize?: number; fill?: number; fontWeight?: TextStyleFontWeight; anchor?: [number, number]; wordWrap?: boolean; wordWrapWidth?: number } = {},
): Text {
  const style: TextStyleOptions = {
    fontFamily: THEME.fontFamily,
    fontSize: opts.fontSize ?? 16,
    fill: opts.fill ?? THEME.text,
  };
  if (opts.fontWeight) style.fontWeight = opts.fontWeight;
  if (opts.wordWrap) {
    style.wordWrap = true;
    style.wordWrapWidth = opts.wordWrapWidth ?? 200;
  }
  const label = new Text({ text, style, resolution: Math.max(2, window.devicePixelRatio || 2) });
  if (opts.anchor) label.anchor.set(opts.anchor[0], opts.anchor[1]);
  return label;
}
