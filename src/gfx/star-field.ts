import { type Application, Container, Sprite, Texture } from 'pixi.js';
import { markDirty } from './render-gate';

/** One parallax layer: star size in px, peak alpha, share of the camera pan it follows, star count. */
const STAR_LAYERS = [
  { size: 1, alpha: 0.6, parallax: 0.05, count: 90 },
  { size: 2, alpha: 0.8, parallax: 0.1, count: 55 },
  { size: 3, alpha: 1, parallax: 0.18, count: 30 },
];
/** The Big Dipper in art px relative to its centre (bowl right, handle left),
 *  drawn with the brightest star layer. */
const BIG_DIPPER = [
  { x: 28, y: -24 }, // Dubhe
  { x: 34, y: 14 }, // Merak
  { x: -20, y: 22 }, // Phecda
  { x: -26, y: -14 }, // Megrez
  { x: -72, y: -26 }, // Alioth
  { x: -112, y: -42 }, // Mizar
  { x: -150, y: -34 }, // Alkaid
];
/** Constellation centre as a share of the screen: the centre of the left half. */
const BIG_DIPPER_AT = { x: 0.25, y: 0.5 };
/** Size relative to the art coordinates above. */
const BIG_DIPPER_SCALE = 1.3;
const BIG_DIPPER_PARALLAX = 0.12;
const BIG_DIPPER_SIZE = 3;
/** Art px per screen px of the shorter side / this, so it scales with small screens. */
const BIG_DIPPER_REF_SIDE = 800;

/** Flicker is redrawn at this rate, not every frame, to keep idle rendering cheap. */
const FLICKER_STEP_MS = 90;
/** Alpha swings between `1 - FLICKER_DEPTH` and 1 of the layer's peak alpha. */
const FLICKER_DEPTH = 0.35;

/** While loading, stars fade in one by one: each waits a random delay up to this, then fades over `FADE_SLOW_MS`. */
const LOAD_MAX_DELAY_MS = 7000;
const FADE_SLOW_MS = 2500;
/** After loading, the stars that are still dim reach their normal alpha this fast. */
const FADE_FAST_MS = 350;

/** Fade-in state every star carries: `appear` 0..1 multiplies its alpha. */
interface Appear {
  appear: number;
  /** Delay (ms after loading started) before this star begins to fade in. */
  delay: number;
}

interface Star extends Appear {
  sprite: Sprite;
  /** Position in the unit square, wrapped over the screen. */
  u: number;
  v: number;
  phase: number;
  speed: number;
}

interface StarLayer {
  stars: Star[];
  spec: (typeof STAR_LAYERS)[number];
}

/** A fixed star of the constellation: offset from its centre in art px. */
interface ConstellationStar extends Appear {
  sprite: Sprite;
  x: number;
  y: number;
  phase: number;
  speed: number;
}

/** A white, flickering star background in three parallax layers; sits below the map. */
export class StarField {
  readonly el = new Container();
  private readonly layers: StarLayer[] = [];
  private readonly dipper: ConstellationStar[] = [];
  private readonly fn: () => void;
  private lastPan = { x: NaN, y: NaN };
  private lastFlicker = 0;
  private lastSize = { w: 0, h: 0 };
  private loadingSince: number | null = null;
  private lastTick = performance.now();
  private animating = false;

  constructor(private readonly app: Application, private readonly pan: () => { x: number; y: number }) {
    this.el.eventMode = 'none';
    for (const spec of STAR_LAYERS) {
      const stars: Star[] = [];
      for (let i = 0; i < spec.count; i++) {
        const sprite = new Sprite(Texture.WHITE);
        sprite.width = spec.size;
        sprite.height = spec.size;
        this.el.addChild(sprite);
        stars.push({ sprite, appear: 1, delay: 0, u: Math.random(), v: Math.random(), phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() * 2.4 });
      }
      this.layers.push({ stars, spec });
    }
    // Centre the constellation's bounding box on its anchor.
    const xs = BIG_DIPPER.map((p) => p.x);
    const ys = BIG_DIPPER.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const p of BIG_DIPPER) {
      const sprite = new Sprite(Texture.WHITE);
      sprite.width = BIG_DIPPER_SIZE;
      sprite.height = BIG_DIPPER_SIZE;
      this.el.addChild(sprite);
      this.dipper.push({ sprite, appear: 1, delay: 0, x: p.x - cx, y: p.y - cy, phase: Math.random() * Math.PI * 2, speed: 0.8 + Math.random() * 1.6 });
    }
    this.fn = () => this.update();
    app.ticker.add(this.fn);
    this.update();
  }

  private update(): void {
    if (this.el.destroyed) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const pan = this.pan();
    const now = performance.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (this.animating) this.advanceAppear(now, dt);
    const moved = pan.x !== this.lastPan.x || pan.y !== this.lastPan.y || w !== this.lastSize.w || h !== this.lastSize.h;
    const flicker = this.animating || now - this.lastFlicker >= FLICKER_STEP_MS;
    if (!moved && !flicker) return;
    if (flicker) this.lastFlicker = now;
    this.lastPan = { x: pan.x, y: pan.y };
    this.lastSize = { w, h };
    const t = now / 1000;
    for (const { stars, spec } of this.layers) {
      for (const s of stars) {
        if (moved) {
          s.sprite.position.set(wrap(s.u * w + pan.x * spec.parallax, w), wrap(s.v * h + pan.y * spec.parallax, h));
        }
        if (flicker) {
          const k = 1 - FLICKER_DEPTH * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
          s.sprite.alpha = spec.alpha * k * s.appear;
        }
      }
    }
    const unit = (Math.min(w, h) / BIG_DIPPER_REF_SIDE) * BIG_DIPPER_SCALE;
    for (const s of this.dipper) {
      if (moved) {
        s.sprite.position.set(
          w * BIG_DIPPER_AT.x + pan.x * BIG_DIPPER_PARALLAX + s.x * unit,
          h * BIG_DIPPER_AT.y + pan.y * BIG_DIPPER_PARALLAX + s.y * unit,
        );
      }
      if (flicker) s.sprite.alpha = (1 - FLICKER_DEPTH * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))) * s.appear;
    }
    markDirty();
  }

  /** While loading every star is transparent and fades in slowly, one by one at
   *  a random moment and place; when loading ends they all reach full alpha fast. */
  setLoading(loading: boolean): void {
    if (loading === (this.loadingSince !== null)) return;
    if (loading) {
      this.loadingSince = performance.now();
      for (const { stars } of this.layers) {
        for (const s of stars) {
          s.appear = 0;
          s.delay = Math.random() * LOAD_MAX_DELAY_MS;
          s.u = Math.random();
          s.v = Math.random();
        }
      }
      for (const s of this.dipper) {
        s.appear = 0;
        s.delay = Math.random() * LOAD_MAX_DELAY_MS;
      }
      this.lastSize = { w: 0, h: 0 }; // force a reposition for the new places
    } else {
      this.loadingSince = null;
    }
    this.lastTick = performance.now();
    this.animating = true;
  }

  private advanceAppear(now: number, dt: number): void {
    const loading = this.loadingSince;
    const step = Math.min(dt, 100);
    let pending = false;
    const advance = (s: Appear): void => {
      if (s.appear >= 1) return;
      if (loading === null) s.appear = Math.min(1, s.appear + step / FADE_FAST_MS);
      else if (now - loading >= s.delay) s.appear = Math.min(1, s.appear + step / FADE_SLOW_MS);
      if (s.appear < 1) pending = true;
    };
    for (const { stars } of this.layers) for (const s of stars) advance(s);
    for (const s of this.dipper) advance(s);
    // While loading keep ticking until the page is released; afterwards stop at full alpha.
    this.animating = pending || loading !== null;
  }

  destroy(): void {
    this.app.ticker.remove(this.fn);
    this.el.destroy({ children: true });
  }
}

function wrap(v: number, size: number): number {
  return size > 0 ? ((v % size) + size) % size : 0;
}
