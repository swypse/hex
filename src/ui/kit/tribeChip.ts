import { Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';

export interface IconChipOpts {
  bgColor?: number;
  border?: { width: number; color: number };
}

/** A round chip with the given icon texture clipped inside it. */
export function makeIconChip(iconFile: string, size: number, opts: IconChipOpts = {}): Container {
  const chip = new Container();
  const radius = size / 2;
  const bgColor = opts.bgColor ?? 0xffffff;
  const bg = new Graphics();
  bg.circle(0, 0, radius).fill(bgColor);
  if (opts.border && opts.border.width > 0) bg.stroke({ width: opts.border.width, color: opts.border.color });
  const clip = new Graphics();
  clip.circle(0, 0, radius).fill(0xffffff);
  const icon = makeIcon(iconFile, size);
  icon.mask = clip;
  chip.addChild(bg, clip, icon);
  return chip;
}
