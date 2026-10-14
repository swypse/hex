import { type Application, Container, Graphics } from 'pixi.js';
import { markDirty } from './render-gate';

const CONFETTI_COUNT = 36;
const CONFETTI_MS = 1400;
const CONFETTI_GRAVITY = 380;
const CONFETTI_COLORS = [0xff4d4d, 0xffcc00, 0x49cc5d, 0x4da6ff, 0xff6fd8, 0xffffff];

/** A burst of confetti ribbons at (`x`, `y`) in `parent`: thrown up and out, pulled
 *  down by gravity, spinning and fading. `scale` sizes the whole burst. */
export function spawnConfettiBurst(app: Application, parent: Container, x: number, y: number, scale = 1, zIndex = 12): void {
  const el = new Container();
  el.zIndex = zIndex;
  el.scale.set(scale);
  const pieces: { g: Graphics; vx: number; vy: number; spin: number }[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const g = new Graphics();
    const w = 3 + Math.random() * 3;
    const h = 8 + Math.random() * 8;
    g.rect(-w / 2, -h / 2, w, h).fill(CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    g.rotation = Math.random() * Math.PI;
    el.addChild(g);
    const angle = Math.random() * Math.PI * 2;
    const speed = 90 + Math.random() * 130;
    pieces.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * 0.6 - 160, spin: (Math.random() - 0.5) * 16 });
  }
  el.position.set(x, y);
  parent.addChild(el);

  const start = performance.now();
  const ticker = app.ticker;
  const fn = (): void => {
    if (el.destroyed) {
      ticker.remove(fn);
      return;
    }
    const age = performance.now() - start;
    const t = Math.min(1, age / CONFETTI_MS);
    const sec = age / 1000;
    for (const p of pieces) {
      p.g.position.set(p.vx * sec, p.vy * sec + 0.5 * CONFETTI_GRAVITY * sec * sec);
      p.g.rotation += p.spin * 0.016;
      p.g.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
    markDirty();
    if (t >= 1) {
      ticker.remove(fn);
      el.parent?.removeChild(el);
      el.destroy({ children: true });
    }
  };
  ticker.add(fn);
}
