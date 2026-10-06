import { clamp01 } from './math';

/** Fast start, slow end; `t` clamps to [0, 1]. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Overshoots 1 before settling; `t` clamps to [0, 1]. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * Math.pow(x, 3) + c1 * Math.pow(x, 2);
}
