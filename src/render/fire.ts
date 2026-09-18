import { Application, Container, Graphics, type Ticker } from 'pixi.js';

const FIRE_PARTICLE_COUNT = 12;
const FIRE_COLORS = [0xff5500, 0xff3300, 0xff2200, 0xff7700, 0xffaa00, 0xff8800];
const FIRE_SPREAD_X = 16;
const FIRE_RISE = 36;
export const FIRE_SIZE_MIN = 6;
export const FIRE_SIZE_MAX = 12;
const FIRE_BASE_Y = 6;

interface FireParticle {
  g: Graphics;
  x: number;
  vy: number;
  size: number;
  color: number;
  life: number;
  rate: number;
}

interface FireEffect {
  el: Container;
  particles: FireParticle[];
}

/** A world-anchored overlay registration: `el` sits in the screen-space
 *  overlay and the host repositions `el` each frame at `world * scale`. */
export interface FireOverlayItem {
  el: Container;
  world: { x: number; y: number };
}

/** Services a fire-particle layer needs from the host map view. */
export interface FireEffectsOptions {
  app: Application;
  /** Zoom-independent overlay the effects render into. */
  overlay: Container;
  /** Registry the effect containers register into, so the host repositions
   *  them with the camera and releases them on overlay rebuilds. */
  overlayItems: FireOverlayItem[];
  /** Returns a pooled `Graphics` for each particle. */
  takeGraphics: () => Graphics;
}

/** Permanent fire particle effects over villages occupied by an enemy unit,
 *  plus the red spark pop when a bonus is claimed. Each effect is a container
 *  of self-animating particles registered in the host's overlay items; the
 *  animation runs until `clear` drops all effects (called on every map update,
 *  after which the caller re-adds the ones still burning). */
export class FireEffects {
  private effects: FireEffect[] = [];
  private animRemove: (() => void) | null = null;

  constructor(private readonly opts: FireEffectsOptions) {}

  /** Red spark pop over a claimed bonus. */
  claimSparks(x: number, y: number): void {
    this.burst(x, y, 10, [0xc30505, 0xff6363]);
    this.startTick();
  }

  /** Fire particles around a village occupied by an enemy unit. */
  add(x: number, y: number): void {
    this.burst(x, y, FIRE_PARTICLE_COUNT, FIRE_COLORS);
  }

  /** Whether any fire effect is currently burning. */
  get active(): boolean {
    return this.effects.length > 0;
  }

  /** Drop every effect and stop the shared animation ticker. */
  clear(): void {
    if (this.animRemove) {
      const remover = this.animRemove;
      this.animRemove = null;
      remover();
    }
    this.effects = [];
  }

  destroy(): void {
    this.clear();
  }

  /** Starts (or reuses) the ticker that advances every burning effect. */
  startTick(): void {
    if (this.animRemove) return;
    const ticker = this.opts.app.ticker;
    const fn = (t: Ticker): void => {
      if (this.effects.length === 0) {
        ticker.remove(fn);
        this.animRemove = null;
        return;
      }
      const dt = Math.min(0.1, t.deltaMS / 1000);
      for (const fx of this.effects) {
        for (const p of fx.particles) {
          p.life += p.rate * dt;
          if (p.life >= 1) {
            p.life = 0;
            p.x = (Math.random() - 0.5) * 2 * FIRE_SPREAD_X;
            p.vy = 24 + Math.random() * 24;
            p.size = FIRE_SIZE_MIN + Math.random() * (FIRE_SIZE_MAX - FIRE_SIZE_MIN);
            p.color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)]!;
          }
          this.place(p);
        }
      }
    };
    ticker.add(fn);
    this.animRemove = () => ticker.remove(fn);
  }

  private burst(x: number, y: number, count: number, colors: number[]): void {
    const el = new Container();
    const particles: FireParticle[] = [];
    for (let i = 0; i < count; i++) {
      const g = this.opts.takeGraphics();
      const p: FireParticle = {
        g,
        x: (Math.random() - 0.5) * 2 * FIRE_SPREAD_X,
        vy: 24 + Math.random() * 24,
        size: FIRE_SIZE_MIN + Math.random() * (FIRE_SIZE_MAX - FIRE_SIZE_MIN),
        color: colors[i % colors.length]!,
        life: Math.random(),
        rate: 0.4 + Math.random() * 0.3,
      };
      el.addChild(g);
      particles.push(p);
      this.place(p);
    }
    this.effects.push({ el, particles });
    this.opts.overlay.addChild(el);
    this.opts.overlayItems.push({ el, world: { x, y } });
  }

  private place(p: FireParticle): void {
    const t01 = p.life;
    const fadeIn = Math.min(1, t01 / 0.15);
    const fadeOut = t01 > 0.7 ? Math.max(0, (1 - t01) / 0.3) : 1;
    p.g.position.set(p.x + Math.sin(t01 * Math.PI * 3) * 3, FIRE_BASE_Y - t01 * FIRE_RISE);
    p.g.alpha = fadeIn * fadeOut;
    p.g.clear().rect(-p.size / 2, -p.size / 2, p.size, p.size).fill(p.color);
  }
}