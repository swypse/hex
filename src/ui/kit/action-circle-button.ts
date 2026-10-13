import { Container, Graphics } from 'pixi.js';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeLabel } from '../../gfx/label';
import type { Resources } from '../../game/economy/resources';
import { FontSize } from '@enums';
import { makeIcon } from './icon';

export const ACTION_CELL_W = 92;
export const ACTION_CELL_H = 112;
const RADIUS = 30;
const NAME_Y = 66;
const COST_Y = 84;
const COST_ICON_SIZE = 16;

export interface CostPart {
  /** 32px-atlas icon key, e.g. `gold-32`. */
  icon: string;
  label: string;
}

/** Non-zero parts of a cost as icon + amount pairs (money, wood, stone, ore). */
export function resourceCostParts(cost: Resources): CostPart[] {
  const parts: CostPart[] = [];
  if (cost.money > 0) parts.push({ icon: 'gold-32', label: String(cost.money) });
  if (cost.wood > 0) parts.push({ icon: 'wood-32', label: String(cost.wood) });
  if (cost.stone > 0) parts.push({ icon: 'stone-32', label: String(cost.stone) });
  if (cost.ore > 0) parts.push({ icon: 'ore-32', label: String(cost.ore) });
  return parts;
}

interface ActionCircleOpts {
  /** Action-button atlas key (e.g. `action-spawn-warrior`, `sawmill`). */
  icon: string;
  name: string;
  cost: CostPart[];
  /** Cost text size. Default `FontSize.SMALL`. */
  costFontSize?: FontSize;
  /** Draw each cost as `<icon> N` instead of `N <icon>`. */
  costIconFirst?: boolean;
  /** Drawn faded; the click handler still fires. */
  dimmed?: boolean;
  /** Drawn faded and inert: no click, no pointer cursor. */
  disabled?: boolean;
  onClick: () => void;
}

/** A circle action button with its name and cost row underneath, sized
 *  `ACTION_CELL_W` x `ACTION_CELL_H`. */
export function makeActionCircleButton(opts: ActionCircleOpts): Container {
  const item = new Container();
  item.eventMode = 'static';
  item.cursor = 'pointer';
  const cx = ACTION_CELL_W / 2;

  const circle = new Graphics();
  circle.circle(cx, RADIUS, RADIUS).fill(0x333333).stroke({ width: 2, color: 0x888888 });
  item.addChild(circle);

  // Clip the icon to the circle so its texture never spills past the border.
  const clip = new Graphics();
  clip.circle(cx, RADIUS, RADIUS).fill(0xffffff);
  item.addChild(clip);

  const icon = makeActionButtonIcon(opts.icon, RADIUS * 2);
  icon.position.set(cx, RADIUS);
  icon.mask = clip;
  item.addChild(icon);

  const name = makeLabel(opts.name, { fontSize: FontSize.SMALL, fill: 0xffffff });
  name.position.set((ACTION_CELL_W - name.width) / 2, NAME_Y);
  item.addChild(name);

  const row = new Container();
  let x = 0;
  for (const p of opts.cost) {
    const value = makeLabel(p.label, { fontSize: opts.costFontSize ?? FontSize.SMALL, fill: 0xffffff });
    const coin = makeIcon(p.icon, COST_ICON_SIZE);
    // Text is a little shorter than the icon: centre it on the icon's row.
    const textY = (COST_ICON_SIZE - value.height) / 2;
    if (opts.costIconFirst) {
      coin.position.set(x + COST_ICON_SIZE / 2, COST_ICON_SIZE / 2);
      value.position.set(x + COST_ICON_SIZE + 2, textY);
    } else {
      coin.position.set(x + value.width + COST_ICON_SIZE / 2 + 2, COST_ICON_SIZE / 2);
      value.position.set(x, 0);
    }
    row.addChild(value, coin);
    x += value.width + COST_ICON_SIZE + 2 + 6;
  }
  row.position.set((ACTION_CELL_W - x) / 2, COST_Y);
  item.addChild(row);

  item.alpha = opts.dimmed || opts.disabled ? 0.4 : 1;
  if (opts.disabled) {
    item.eventMode = 'none';
    item.cursor = 'default';
  } else {
    item.on('pointertap', opts.onClick);
  }
  return item;
}
