import { Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';

export interface IconChipOpts {
  bgColor?: number;
  border?: { width: number; color: number; alignment?: number };
}

/** A round chip clipping an arbitrary icon container inside it. */
export function makeCircleChip(child: Container, size: number, opts: IconChipOpts = {}): Container {
  const chip = new Container();
  const radius = size / 2;
  const bgColor = opts.bgColor ?? 0xffffff;
  const bg = new Graphics();
  bg.circle(0, 0, radius).fill(bgColor);
  if (opts.border && opts.border.width > 0) bg.stroke({ width: opts.border.width, color: opts.border.color, alignment: opts.border.alignment ?? 0.5 });
  const clip = new Graphics();
  clip.circle(0, 0, radius).fill(0xffffff);
  const icon = child;
  icon.mask = clip;
  chip.addChild(bg, clip, icon);
  return chip;
}

/** A round chip with the given icon texture clipped inside it. */
export function makeIconChip(iconFile: string, size: number, opts: IconChipOpts = {}): Container {
  return makeCircleChip(makeIcon(iconFile, size), size, opts);
}
