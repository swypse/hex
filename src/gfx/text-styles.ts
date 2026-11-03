import type { BitmapText } from 'pixi.js';
import { FontSize, TextStyle } from '@enums';
import { makeLabel } from './label';

type LabelOpts = NonNullable<Parameters<typeof makeLabel>[1]>;

/** Look of each shared text style; sizes come from the `FontSize` scale. */
const STYLES: Record<TextStyle, LabelOpts> = {
  [TextStyle.H1]: { fontSize: FontSize.BIG, fontWeight: 'bold', fill: 0xffffff },
  [TextStyle.H2]: { fontSize: FontSize.NORMAL, fontWeight: 'bold', fill: 0xffffff },
};

/** A label in a shared text style; `overrides` win over the preset. */
export function makeStyledLabel(text: string, style: TextStyle, overrides: LabelOpts = {}): BitmapText {
  return makeLabel(text, { ...STYLES[style], ...overrides });
}
