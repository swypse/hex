import { Container, Graphics, type Application } from 'pixi.js';
import type { StormClock } from './storm-effect';

const FUNNEL_LAYERS = 9;
const FUNNEL_HEIGHT = 2.4;
const FUNNEL_TOP_WIDTH = 0.62;
const FUNNEL_BASE_WIDTH = 0.1;
const SWAY = 0.14;
const SPIN_MS = 340;
const DEBRIS_COUNT = 10;
const DEBRIS_MS = 1800;
const FUNNEL_COLOR = 0xd9dde3;
const SHADE_COLOR = 0x6d7480;
const DUST_COLOR = 0xb89b6a;
const DEBRIS_COLOR = 0x8a5a2b;
const EFFECT_Z = 13;

/** Where a funnel stands (world position); `debris` when it is over a building or forest. */
export interface TornadoPoint {
  x: number;
  y: number;
  debris: boolean;
}

/** A funnel swirling over each given world point (tile centres), with dust at
 *  its foot and boards and sticks orbiting it. Runs a ticker only while there
 *  are tornadoes. */
export class TornadoEffect {
  private readonly el = new Container();
  private readonly g = new Graphics();
  private points: TornadoPoint[] = [];
  private tickFn: (() => void) | null = null;

  constructor(private readonly app: Application, parent: Container, private readonly hexSize: number, private readonly clock: StormClock) {
    this.el.zIndex = EFFECT_Z;
    this.el.addChild(this.g);
    parent.addChild(this.el);
  }

  set(points: TornadoPoint[]): void {
    this.points = points;
    if (points.length === 0) {
      this.g.clear();
      this.stop();
    } else if (!this.tickFn) {
      this.tickFn = () => this.draw();
      this.app.ticker.add(this.tickFn);
    }
  }

  private draw(): void {
    if (this.el.destroyed) {
      this.stop();
      return;
    }
    if (this.clock.isPaused()) return;
    const now = this.clock.now();
    this.g.clear();
    for (const p of this.points) this.drawFunnel(p, now);
  }

  private drawFunnel(p: TornadoPoint, now: number): void {
    const { g, hexSize } = this;
    const height = hexSize * FUNNEL_HEIGHT;
    // Dust ring at the foot.
    for (let i = 0; i < 3; i++) {
      const a = now / 500 + i * 2.1;
      g.ellipse(p.x + Math.cos(a) * hexSize * 0.12, p.y + hexSize * 0.1, hexSize * (0.5 + i * 0.1), hexSize * (0.16 + i * 0.03)).fill({ color: DUST_COLOR, alpha: 0.2 });
    }
    // Stacked rings, narrow at the foot, swaying as they rise.
    for (let i = 0; i < FUNNEL_LAYERS; i++) {
      const t = i / (FUNNEL_LAYERS - 1);
      const w = hexSize * (FUNNEL_BASE_WIDTH + (FUNNEL_TOP_WIDTH - FUNNEL_BASE_WIDTH) * t * t);
      const cx = p.x + Math.sin(now / 420 - t * 4.2) * hexSize * SWAY * (0.3 + t);
      const cy = p.y - t * height;
      const a = now / SPIN_MS + t * 3;
      g.ellipse(cx, cy, w, w * 0.28).stroke({ width: 2.5, color: i % 2 === 0 ? FUNNEL_COLOR : SHADE_COLOR, alpha: 0.75 });
      // A short bright swirl arc on the front of each ring.
      for (let k = 0; k <= 4; k++) {
        const b = a + k * 0.35;
        const x = cx + Math.cos(b) * w;
        const y = cy + Math.sin(b) * w * 0.28;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 2, color: 0xffffff, alpha: 0.45, cap: 'round' });
    }
    // Boards and sticks orbiting the funnel, only while it tears at a building or forest.
    if (!p.debris) return;
    for (let i = 0; i < DEBRIS_COUNT; i++) {
      const t = ((now / DEBRIS_MS + i / DEBRIS_COUNT) % 1);
      const a = now / 260 + i * 2.4;
      const rise = t * height * 0.9;
      const r = hexSize * (0.2 + 0.45 * t);
      const x = p.x + Math.cos(a) * r;
      const y = p.y - rise + Math.sin(a) * r * 0.28;
      const len = hexSize * (i % 2 === 0 ? 0.22 : 0.14);
      const dx = Math.cos(a * 1.7) * len * 0.5;
      const dy = Math.sin(a * 1.7) * len * 0.5;
      g.moveTo(x - dx, y - dy).lineTo(x + dx, y + dy).stroke({ width: i % 2 === 0 ? 3 : 2, color: DEBRIS_COLOR, alpha: 0.9 * Math.sin(t * Math.PI), cap: 'butt' });
    }
  }

  private stop(): void {
    if (!this.tickFn) return;
    this.app.ticker.remove(this.tickFn);
    this.tickFn = null;
  }

  destroy(): void {
    this.stop();
    this.el.destroy({ children: true });
  }
}
