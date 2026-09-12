import { Application, Container, Graphics } from 'pixi.js';

export const MUZZLE_MS = 1200;
export const MUZZLE_STAGGER = 150;
export const MUZZLE_COUNT = 10;
const MUZZLE_RISE = 80;

export interface MuzzleParticleParams {
  color: number;
  opacity: number;
  start: number;
  end: number;
}

export function muzzleParticleParams(
  rng: () => number = Math.random,
): MuzzleParticleParams {
  const minColor = 0x222222;
  const span = 0xffffff - minColor;
  return {
    color: minColor + Math.floor(rng() * (span + 1)),
    opacity: 0.2 + rng() * 0.3,
    start: 2 + rng() * 2,
    end: 6 + rng() * 4,
  };
}

interface SmokeParticle {
  g: Graphics;
  color: number;
  x0: number;
  swing: number;
  phase: number;
  opacity: number;
  start: number;
  end: number;
  delay: number;
}

export function spawnMuzzleSmoke(
  app: Application,
  mapRoot: Container,
  x: number,
  y: number,
): void {
  const el = new Container();
  el.zIndex = 10;
  el.position.set(x, y);
  const particles: SmokeParticle[] = [];
  for (let i = 0; i < MUZZLE_COUNT; i++) {
    const params = muzzleParticleParams();
    const g = new Graphics();
    g.rect(-params.start / 2, -params.start / 2, params.start, params.start).fill({ color: params.color, alpha: 1 });
    g.alpha = 0;
    el.addChild(g);
    particles.push({
      g,
      color: params.color,
      x0: (Math.random() - 0.5) * 24,
      swing: 8 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      opacity: params.opacity,
      start: params.start,
      end: params.end,
      delay: Math.random() * MUZZLE_STAGGER,
    });
  }
  mapRoot.addChild(el);

  const tickStart = performance.now();
  const ticker = app.ticker;
  const fn = (): void => {
    const age = performance.now() - tickStart;
    for (const p of particles) {
      const localAge = age - p.delay;
      if (localAge <= 0) continue;
      const t = Math.min(1, localAge / MUZZLE_MS);
      const radius = p.start + (p.end - p.start) * t;
      p.g.clear();
      p.g.rect(-radius / 2, -radius / 2, radius, radius).fill({ color: p.color, alpha: 1 });
      p.g.alpha = p.opacity * (1 - t);
      p.g.position.set(
        p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing,
        -MUZZLE_RISE * t,
      );
    }
    if (age >= MUZZLE_MS + MUZZLE_STAGGER) {
      ticker.remove(fn);
      mapRoot.removeChild(el);
      el.destroy();
    }
  };
  ticker.add(fn);
}