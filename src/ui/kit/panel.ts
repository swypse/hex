import { Graphics, GraphicsPath } from 'pixi.js';
import { THEME } from './theme';

export function makePanel(
  width: number,
  height: number,
  opts: { radius?: number; fill?: number; alpha?: number; bottomRadiusOnly?: boolean; rightRadiusOnly?: boolean } = {},
): Graphics {
  const g = new Graphics();
  const radius = opts.radius ?? THEME.radius;
  const fill = { color: opts.fill ?? THEME.panelBg, alpha: opts.alpha ?? THEME.panelAlpha };
  if (opts.rightRadiusOnly) {
    const path = new GraphicsPath();
    path
      .moveTo(0, 0)
      .lineTo(width - radius, 0)
      .arcTo(width, 0, width, radius, radius)
      .lineTo(width, height - radius)
      .arcTo(width, height, width - radius, height, radius)
      .lineTo(0, height)
      .closePath();
    g.path(path).fill(fill);
    return g;
  }
  if (!opts.bottomRadiusOnly) {
    g.roundRect(0, 0, width, height, radius).fill(fill);
    return g;
  }
  const path = new GraphicsPath();
  path
    .moveTo(0, 0)
    .lineTo(width, 0)
    .lineTo(width, height - radius)
    .arcTo(width, height, width - radius, height, radius)
    .lineTo(radius, height)
    .arcTo(0, height, 0, height - radius, radius)
    .closePath();
  g.path(path).fill(fill);
  return g;
}

export function makeCircle(
  radius: number,
  fill: number,
  stroke?: { width: number; color: number },
): Graphics {
  const g = new Graphics();
  g.circle(0, 0, radius).fill(fill);
  if (stroke) g.stroke({ width: stroke.width, color: stroke.color });
  return g;
}
