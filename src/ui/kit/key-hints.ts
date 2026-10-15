import { Container, Graphics } from 'pixi.js';
import { makeLabel } from '../../gfx/label';
import { FontSize } from '@enums';

const KEY_PAD_X = 6;
const KEY_PAD_Y = 3;
const KEY_RADIUS = 4;
const KEY_TO_LABEL_GAP = 6;
const ITEM_GAP = 18;

export interface KeyHint {
  /** Key cap text, e.g. '↑↓' or 'Enter'. */
  key: string;
  /** What the key does. */
  label: string;
}

/** A horizontal row of key-cap chips with captions: `[↑↓] Select  [Enter] Confirm`. */
export class KeyHints extends Container {
  constructor(hints: readonly KeyHint[]) {
    super();
    let x = 0;
    for (const hint of hints) {
      const key = makeLabel(hint.key, { fontSize: FontSize.VERY_SMALL, fill: 0xffffff });
      const capW = key.width + KEY_PAD_X * 2;
      const capH = key.height + KEY_PAD_Y * 2;
      const cap = new Graphics()
        .roundRect(0, 0, capW, capH, KEY_RADIUS)
        .fill({ color: 0xffffff, alpha: 0.12 })
        .stroke({ color: 0xffffff, alpha: 0.45, width: 1 });
      cap.position.set(x, 0);
      key.position.set(x + KEY_PAD_X, KEY_PAD_Y);
      const label = makeLabel(hint.label, { fontSize: FontSize.VERY_SMALL, fill: 0xcfd6ee });
      label.position.set(x + capW + KEY_TO_LABEL_GAP, (capH - label.height) / 2);
      this.addChild(cap, key, label);
      x += capW + KEY_TO_LABEL_GAP + label.width + ITEM_GAP;
    }
  }
}

/** Screen margins for `placeKeyHints`. */
const HINTS_MIN_LEFT = 40;
const HINTS_LEFT_SHARE = 0.1;
const HINTS_BOTTOM = 14;
const HINTS_COMPACT_WIDTH = 640;

/** Puts the hints row in the shared spot of the menu screens: bottom-left,
 *  aligned with the start menu column (centred on narrow screens). */
export function placeKeyHints(hints: KeyHints, screenW: number, screenH: number): void {
  const x = screenW < HINTS_COMPACT_WIDTH ? (screenW - hints.width) / 2 : Math.max(HINTS_MIN_LEFT, screenW * HINTS_LEFT_SHARE);
  hints.position.set(x, screenH - hints.height - HINTS_BOTTOM);
}
