import { type Graphics } from 'pixi.js';

export interface Point {
  x: number;
  y: number;
}

const MAIN_SEGMENTS = 12;
const MAIN_JITTER = 22;
const BRANCH_COUNT = 3;
const BRANCH_SEGMENTS = 4;
const CORE_COLOR = 0xffffff;

/** Jagged polyline from `from` to `to`: every inner point is shifted sideways by up to `jitter`. */
function jaggedPath(from: Point, to: Point, segments: number, jitter: number, rng: () => number): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Point[] = [from];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const off = (rng() - 0.5) * 2 * jitter;
    pts.push({ x: from.x + dx * t + nx * off, y: from.y + dy * t + ny * off });
  }
  pts.push(to);
  return pts;
}

function strokePath(g: Graphics, pts: Point[], width: number, alpha: number): void {
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.stroke({ width, color: CORE_COLOR, alpha, join: 'round', cap: 'round' });
}

/** Draws a white lightning bolt from `from` (top of the screen) down to `to`,
 *  with a soft wide glow under a thin core and a few short side branches. */
export function drawLightning(g: Graphics, from: Point, to: Point, rng: () => number = Math.random): void {
  const main = jaggedPath(from, to, MAIN_SEGMENTS, MAIN_JITTER, rng);
  const branches: Point[][] = [];
  for (let i = 0; i < BRANCH_COUNT; i++) {
    const start = main[2 + Math.floor(rng() * (main.length - 5))]!;
    const side = rng() < 0.5 ? -1 : 1;
    const end = { x: start.x + side * (30 + rng() * 40), y: start.y + 40 + rng() * 50 };
    branches.push(jaggedPath(start, end, BRANCH_SEGMENTS, 10, rng));
  }
  g.clear();
  strokePath(g, main, 12, 0.3);
  for (const b of branches) strokePath(g, b, 6, 0.3);
  strokePath(g, main, 4, 1);
  for (const b of branches) strokePath(g, b, 2, 1);
}
