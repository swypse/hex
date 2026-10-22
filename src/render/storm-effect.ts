import { Container, Graphics, type Application } from 'pixi.js';
import { WeatherEffectKind } from '@enums';

const STORM_MS = 2400;
const DELAY_PER_RING_MS = 80;
const FADE_MS = 350;
const STREAKS_PER_TILE = 4;
const STREAK_MS = 520;
const FOAM_COLOR = 0xffffff;
const HEAT_COLOR = 0xff8c1a;
const HEAT_RISE_MS = 3200;
const HEAT_LINE_WIDTH = 3.5;
const HEAT_ALPHA = 0.3;
const RAIN_COLOR = 0xcfe8ff;
const EFFECT_Z = 12;

export interface StormCell {
  x: number;
  y: number;
  /** Hex distance from the stormcaller: staggers the start so the storm rolls outward. */
  ring: number;
}

interface Streak {
  dx: number;
  dy: number;
  phase: number;
}

function makeStreaks(hexSize: number, rng: () => number): Streak[] {
  return Array.from({ length: STREAKS_PER_TILE }, () => ({
    dx: (rng() - 0.5) * hexSize * 1.2,
    dy: (rng() - 0.5) * hexSize * 0.8,
    phase: rng(),
  }));
}

/** Draws one stormed water cell at animation time `local` ms: short rain
 *  streaks falling down-right, faded by `env` (0..1), plus, with `foam`, two
 *  spinning foam arcs (`index` varies their phase between cells). */
function drawStormCell(
  g: Graphics,
  c: { x: number; y: number },
  streaks: Streak[],
  index: number,
  local: number,
  env: number,
  hexSize: number,
  foam: boolean,
): void {
  const fall = hexSize * 0.9;
  const slant = hexSize * 0.3;
  for (const s of streaks) {
    const t = (local / STREAK_MS + s.phase) % 1;
    const x = c.x + s.dx + (t - 0.5) * slant;
    const y = c.y + s.dy + (t - 0.5) * fall;
    g.moveTo(x, y).lineTo(x - slant * 0.25, y - fall * 0.25);
    g.stroke({ width: 1.5, color: RAIN_COLOR, alpha: 0.8 * env * Math.sin(t * Math.PI), cap: 'round' });
  }
  if (!foam) return;
  const a = local / 260 + index;
  const r = hexSize * 0.45;
  g.arc(c.x, c.y, r, a, a + 1.6).stroke({ width: 2, color: FOAM_COLOR, alpha: 0.55 * env, cap: 'round' });
  g.arc(c.x, c.y, r * 0.6, -a * 1.3, -a * 1.3 + 1.2).stroke({ width: 1.5, color: FOAM_COLOR, alpha: 0.4 * env, cap: 'round' });
}

/** One drought land cell at animation time `local` ms: short orange vertical bars
 *  (square corners) rising from above the surface, drifting slightly sideways and fading out near the top. */
function drawDroughtCell(g: Graphics, c: { x: number; y: number }, streaks: Streak[], local: number, hexSize: number): void {
  const rise = hexSize * 0.9;
  const len = hexSize * 0.28;
  for (const s of streaks) {
    const t = (local / HEAT_RISE_MS + s.phase) % 1;
    const x = c.x + s.dx + Math.sin(t * Math.PI * 2 + s.phase * 6) * hexSize * 0.05;
    const y = c.y - hexSize * 0.25 + s.dy * 0.4 - t * rise;
    g.rect(x - HEAT_LINE_WIDTH / 2, y, HEAT_LINE_WIDTH, len).fill({ color: HEAT_COLOR, alpha: HEAT_ALPHA * Math.sin(t * Math.PI) });
  }
}

/** Host hooks for the storm animations: an animation clock that excludes the
 *  time spent paused, and whether the camera is being dragged or zoomed (the
 *  animations then freeze in place). */
export interface StormClock {
  now: () => number;
  isPaused: () => boolean;
}

/** Rain and spinning foam arcs over every stormed water cell, rolling outward
 *  from the stormcaller and fading in then out. Parented to the map container;
 *  removes itself when done. */
export function spawnStormEffect(app: Application, mapRoot: Container, cells: StormCell[], hexSize: number, clock: StormClock): void {
  if (cells.length === 0) return;
  const el = new Container();
  el.zIndex = EFFECT_Z;
  const g = new Graphics();
  el.addChild(g);
  mapRoot.addChild(el);
  const streaks = cells.map(() => makeStreaks(hexSize, Math.random));
  const start = clock.now();
  const total = STORM_MS + cells.reduce((m, c) => Math.max(m, c.ring), 0) * DELAY_PER_RING_MS;
  const fn = (): void => {
    if (el.destroyed) {
      app.ticker.remove(fn);
      return;
    }
    if (clock.isPaused()) return;
    const age = clock.now() - start;
    g.clear();
    cells.forEach((c, i) => {
      const local = age - Math.max(0, c.ring - 1) * DELAY_PER_RING_MS;
      if (local <= 0 || local >= STORM_MS) return;
      const env = Math.min(1, local / FADE_MS, (STORM_MS - local) / FADE_MS);
      drawStormCell(g, c, streaks[i]!, i, local, env, hexSize, true);
    });
    if (age >= total) {
      app.ticker.remove(fn);
      mapRoot.removeChild(el);
      el.destroy({ children: true });
    }
  };
  app.ticker.add(fn);
}

/** Small deterministic generator, so a cell keeps its streak layout across rebuilds. */
function seededRng(seed: number): () => number {
  let x = seed | 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  };
}

/** A weather animation looping for as long as the weather covers the cells it is
 *  given: rain over storm water, rising heat lines over drought land. Runs a
 *  ticker only while there are cells. */
export class LoopingWeatherEffect {
  private readonly el = new Container();
  private readonly g = new Graphics();
  private cells: { x: number; y: number; key: string }[] = [];
  private readonly streaks = new Map<string, Streak[]>();
  private tickFn: (() => void) | null = null;
  private readonly t0: number;

  private readonly parent: Container;

  constructor(private readonly app: Application, parent: Container, private readonly hexSize: number, private readonly clock: StormClock, private readonly kind: WeatherEffectKind) {
    this.t0 = clock.now();
    this.parent = parent;
    this.el.zIndex = EFFECT_Z;
    this.el.addChild(this.g);
    parent.addChild(this.el);
  }

  /** Replaces the stormed cells (world positions); starts or stops the loop as needed. */
  set(cells: { x: number; y: number; key: string }[]): void {
    this.cells = cells;
    for (const c of cells) {
      if (!this.streaks.has(c.key)) {
        let seed = 17;
        for (let i = 0; i < c.key.length; i++) seed = (seed * 31 + c.key.charCodeAt(i)) | 0;
        this.streaks.set(c.key, makeStreaks(this.hexSize, seededRng(seed)));
      }
    }
    if (cells.length === 0) {
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
    const local = this.clock.now() - this.t0;
    this.g.clear();
    // The cell list is set on map updates, but the camera pans between them: cull
    // against the current view here, so cells that scroll in are drawn at once.
    const { x: px, y: py, scale } = { x: this.parent.x, y: this.parent.y, scale: this.parent.scale.x };
    const { width, height } = this.app.screen;
    const margin = this.hexSize * scale * 2;
    this.cells.forEach((c, i) => {
      const sx = px + c.x * scale;
      const sy = py + c.y * scale;
      if (sx < -margin || sx > width + margin || sy < -margin || sy > height + margin) return;
      const streaks = this.streaks.get(c.key)!;
      if (this.kind === WeatherEffectKind.DROUGHT) drawDroughtCell(this.g, c, streaks, local, this.hexSize);
      else drawStormCell(this.g, c, streaks, i, local, 1, this.hexSize, false);
    });
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
