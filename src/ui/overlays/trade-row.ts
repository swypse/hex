import type { Container } from 'pixi.js';
import { FontSize } from '@enums';
import { makeRichLabel } from '../kit/rich-label';
import { makeIcon } from '../kit/icon';
import type { Button } from '../kit/button';

export const TRIBE_ICON_SIZE = 24;
export const ROW_BTN_GAP = 6;
const SECOND_LINE_GAP = 2;

interface TradeRowOpts {
  /** Rich text (resource tokens become icons). */
  value: string;
  /** Aligned to the right edge. */
  buttons: Button[];
  /** Icon file or 32px key drawn before the text (a tribe icon, a village icon). */
  iconKey?: string;
  /** Text colour (white when absent). */
  fill?: number;
  /** Grey line below the text. */
  second?: string;
}

/** Adds one row (icon, text, right-aligned buttons, optional second line) to `content` at `y`; returns its height. */
export function addTradeRow(content: Container, y: number, width: number, o: TradeRowOpts): number {
  const bw = o.buttons.reduce((sum, b) => sum + b.width, 0) + ROW_BTN_GAP * Math.max(0, o.buttons.length - 1);
  const lead = o.iconKey ? TRIBE_ICON_SIZE + ROW_BTN_GAP : 0;
  const label = makeRichLabel(o.value, { fontSize: FontSize.SMALL, fill: o.fill ?? 0xffffff, width: Math.max(80, width - bw - ROW_BTN_GAP - lead) });
  const h = Math.max(label.height, TRIBE_ICON_SIZE, ...o.buttons.map((b) => b.height));
  label.position.set(lead, y + (h - label.height) / 2);
  content.addChild(label);
  let extra = 0;
  if (o.second) {
    const line = makeRichLabel(o.second, { fontSize: FontSize.SMALL, fill: 0xcccccc, width: Math.max(80, width - lead) });
    line.position.set(lead, y + h + SECOND_LINE_GAP);
    content.addChild(line);
    extra = SECOND_LINE_GAP + line.height;
  }
  if (o.iconKey) {
    const icon = makeIcon(o.iconKey, TRIBE_ICON_SIZE);
    icon.position.set(TRIBE_ICON_SIZE / 2, y + h / 2);
    content.addChild(icon);
  }
  let x = width - bw;
  for (const b of o.buttons) {
    b.position.set(x, y + (h - b.height) / 2);
    content.addChild(b);
    x += b.width + ROW_BTN_GAP;
  }
  return h + extra;
}
