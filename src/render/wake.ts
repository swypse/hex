import { Application, Container, Graphics } from 'pixi.js';

export interface WakePoint {
  x: number;
  y: number;
}

export const WAKE_JITTER_PX = 8;

export function wakeSquarePositions(
  from: WakePoint,
  to: WakePoint,
  count: number,
  rng: () => number = Math.random,
): WakePoint[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: WakePoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = rng();
    const jitter = (rng() - 0.5) * 2 * WAKE_JITTER_PX;
    pts.push({
      x: from.x + dx * t + nx * jitter,
      y: from.y + dy * t + ny * jitter,
    });
  }
  return pts;
}