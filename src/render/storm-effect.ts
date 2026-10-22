import { Container, Graphics, type Application } from 'pixi.js';

const STORM_MS = 2400;
const DELAY_PER_RING_MS = 80;
const FADE_MS = 350;
const STREAKS_PER_TILE = 4;
const STREAK_MS = 520;
const RAIN_COLOR = 0xcfe8ff;
const FOAM_COLOR = 0xffffff;

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

/** Slanted rain streaks falling over every stormed water cell, a swirling
 *  foam arc on each, fading in from the stormcaller outward and out at the end.
 *  Parented to the map container; removes itself when done. */
export function spawnStormEffect(app: Application, mapRoot: Container, cells: StormCell[], hexSize: number): void {
  if (cells.length === 0) return;
  const el = new Container();
  el.zIndex = 12;
  const g = new Graphics();
  el.addChild(g);
  mapRoot.addChild(el);
  const streaks = cells.map((): Streak[] =>
    Array.from({ length: STREAKS_PER_TILE }, () => ({
      dx: (Math.random() - 0.5) * hexSize * 1.2,
      dy: (Math.random() - 0.5) * hexSize * 0.8,
      phase: Math.random(),
    })),
  );
  const fall = hexSize * 0.9;
  const slant = hexSize * 0.3;
  const start = performance.now();
  const fn = (): void => {
    if (el.destroyed) {
      app.ticker.remove(fn);
      return;
    }
    const age = performance.now() - start;
    const total = STORM_MS + cells.reduce((m, c) => Math.max(m, c.ring), 0) * DELAY_PER_RING_MS;
    g.clear();
    cells.forEach((c, i) => {
      const local = age - Math.max(0, c.ring - 1) * DELAY_PER_RING_MS;
      if (local <= 0 || local >= STORM_MS) return;
      const env = Math.min(1, local / FADE_MS, (STORM_MS - local) / FADE_MS);
      for (const s of streaks[i]!) {
        const t = (local / STREAK_MS + s.phase) % 1;
        const x = c.x + s.dx + (t - 0.5) * slant;
        const y = c.y + s.dy + (t - 0.5) * fall;
        g.moveTo(x, y).lineTo(x - slant * 0.25, y - fall * 0.25);
        g.stroke({ width: 1.5, color: RAIN_COLOR, alpha: 0.8 * env * Math.sin(t * Math.PI), cap: 'round' });
      }
      const a = local / 260 + i;
      const r = hexSize * 0.45;
      g.arc(c.x, c.y, r, a, a + 1.6).stroke({ width: 2, color: FOAM_COLOR, alpha: 0.55 * env, cap: 'round' });
      g.arc(c.x, c.y, r * 0.6, -a * 1.3, -a * 1.3 + 1.2).stroke({ width: 1.5, color: FOAM_COLOR, alpha: 0.4 * env, cap: 'round' });
    });
    if (age >= total) {
      app.ticker.remove(fn);
      mapRoot.removeChild(el);
      el.destroy({ children: true });
    }
  };
  app.ticker.add(fn);
}
