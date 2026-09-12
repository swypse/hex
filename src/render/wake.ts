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

const WAKE_COLOR = 0xaee8ff;
const SQUARE_SIZE = 2;
const PER_TILE_MIN = 10;
const PER_TILE_MAX = 20;
const WAKE_MS = 200;
const WAKE_Z_INDEX = 5;

export function spawnShipWake(
  app: Application,
  container: Container,
  from: WakePoint,
  to: WakePoint,
): void {
  const count = PER_TILE_MIN + Math.floor(Math.random() * (PER_TILE_MAX - PER_TILE_MIN + 1));
  const points = wakeSquarePositions(from, to, count);
  const rects: Graphics[] = [];
  for (const p of points) {
    const g = new Graphics();
    g.rect(0, 0, SQUARE_SIZE, SQUARE_SIZE).fill({ color: WAKE_COLOR, alpha: 1 });
    g.position.set(p.x, p.y);
    g.zIndex = WAKE_Z_INDEX;
    g.alpha = 1;
    container.addChild(g);
    rects.push(g);
  }
  const start = performance.now();
  const ticker = app.ticker;
  const fn = (): void => {
    const t = Math.min(1, (performance.now() - start) / WAKE_MS);
    for (const g of rects) g.alpha = 1 - t;
    if (t >= 1) {
      ticker.remove(fn);
      for (const g of rects) {
        container.removeChild(g);
        g.destroy();
      }
    }
  };
  ticker.add(fn);
}