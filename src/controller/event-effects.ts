import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type MapTile } from '../game/map/map-gen';
import { isExploredFor } from '../game/map/explore';
import { hexDistance, hexToPixel } from '../game/map/hex';
import { tileElevation } from '../render/elevation';
import { spawnMuzzleSmoke } from '../render/smoke';
import { useGameStore } from '../store/game-store';
import { EXPLORED_SCORE } from '../game/score';
import { makeLabel } from '../gfx/label';
import { FONT_BLACK, sizedFontFamily } from '../gfx/bitmap-fonts';
import { markDirty } from '../gfx/render-gate';
import { FontSize } from '@enums';

import type { EventHost } from './event-presenter';

const HEX_SIZE = 40;
const DEATH_PARTICLE_COUNT = 10;
const DEATH_RISE = 200;
const DEATH_MS = 3000;
const DEATH_STAGGER_MS = 700;
/** Arrow projectile flight time for the archer attack animation (ms). */
const PROJECTILE_MS_PER_TILE = 150;

export type EffectsHost = Pick<EventHost, 'app' | 'mapRoot' | 'mapView' | 'textures' | 'camera'>;

/** One-off visual effects the presenter plays at map tiles: floating text, projectiles, deaths, fog reveals. */
export class EventEffects {
  constructor(private readonly host: EffectsHost) {}

  spawnScoreFly(tile: MapTile, playerIndex: number, amount: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (playerIndex !== local && !isExploredFor(tile, local)) return;
    this.spawnFloatText(tile, `+${amount}`, 0xffd700);
  }

  spawnHpText(tile: MapTile, text: string, color: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (!isExploredFor(tile, local)) return;
    this.spawnFloatText(tile, text, color);
  }

  spawnFloatText(tile: MapTile, text: string, color: number): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const label = new BitmapText({
      text,
      style: { fontFamily: sizedFontFamily(FONT_BLACK, FontSize.BIG), fontSize: FontSize.BIG, fill: color },
    });
    label.anchor.set(0.5);
    el.addChild(label);
    const start = {
      x: camera.pan.x + world.x * scale,
      y: camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    };
    el.position.set(start.x, start.y);
    mapRoot.addChild(el);

    const FLOAT_RISE = 44;
    const FLOAT_MS = 900;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - tickStart) / FLOAT_MS);
      el.position.set(start.x, start.y - FLOAT_RISE * t);
      el.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      if (t >= 1) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  /** Spawns a projectile that flies along an arc from the attacker's hex to the
 *  target's hex center, rotating to follow the trajectory, and removes itself
 *  on arrival. The texture points right; leftward shots are flipped
 *  horizontally so the projectile never appears upside-down. */
  spawnProjectile(
    fromTile: MapTile,
    toTile: MapTile,
    texture: Texture,
    heightPx: number,
    /** Multiplier applied to the arc height. 1 keeps the standard archer/ship
     *  lob; catapults use a higher value for a loftier trajectory. */
    arcFactor = 1,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const app = this.host.app();
      const mapView = this.host.mapView();
      if (!app || !mapView) {
        resolve();
        return;
      }
      const world = (tile: MapTile): { x: number; y: number } => {
        const center = hexToPixel(tile, HEX_SIZE);
        return { x: center.x, y: center.y - tileElevation(tile, HEX_SIZE) };
      };
      // World-space endpoints: the projectile lives inside the camera-transformed
      // map container, so panning/zooming mid-flight keeps it glued to the map.
      const start = world(fromTile);
      const end = world(toTile);
      const dist = Math.hypot(end.x - start.x, end.y - start.y) || 1;
      // Arc apex above the straight line, in world (map) units.
      const arcHeight = Math.max(10, Math.min(44, dist * 0.3) * arcFactor);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      // World-unit projectile size; the container's camera scale projects it.
      const base = heightPx / (texture.height || 1);
      sprite.scale.set(base, base);
      sprite.zIndex = 12;
      mapView.container.addChild(sprite);
      sprite.position.set(start.x, start.y);

      const startTime = performance.now();
      const ticker = app.ticker;
      let finished = false;
      const flightMs = Math.max(1, hexDistance(fromTile, toTile)) * PROJECTILE_MS_PER_TILE;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        ticker.remove(fn);
        mapView.container.removeChild(sprite);
        sprite.destroy();
        resolve();
      };
      const fn = (): void => {
        const t = Math.min(1, (performance.now() - startTime) / flightMs);
        // Position follows a linear x/y path with an upward sine-bulge.
        const k = Math.sin(t * Math.PI);
        const x = start.x + (end.x - start.x) * t;
        const y = start.y + (end.y - start.y) * t - arcHeight * k;
        sprite.position.set(x, y);
        // The tangent of the arc: derive the y-bulge term and rotate to match.
        const dx = end.x - start.x;
        const dy = end.y - start.y - arcHeight * Math.PI * Math.cos(t * Math.PI);
        const angle = Math.atan2(dy, dx);
        const leftward = Math.cos(angle) < 0;
        // Pixi applies scale then rotation: with scale.x = -1 the sprite's +x
        // axis maps to (-cos rot, -sin rot). Flip into the mirrored angle so the
        // projectile still points along the trajectory while the texture stays
        // upright (never upside-down on leftward shots).
        if (leftward) {
          sprite.scale.x = -base;
          sprite.rotation = angle > 0 ? angle - Math.PI : angle + Math.PI;
        } else {
          sprite.scale.x = base;
          sprite.rotation = angle;
        }
        if (t >= 1) finish();
      };
      ticker.add(fn);
    });
  }

  /** Arrow projectile that resolves when the shot has landed. */
  spawnArrowFromTo(fromTile: MapTile, toTile: MapTile): Promise<void> {
    const texture = this.host.textures()?.arrowTexture;
    if (!texture) return Promise.resolve();
    return this.spawnProjectile(fromTile, toTile, texture, 5);
  }

  /** Cannonball projectile that resolves when the shot has landed; catapults
   *  use a loftier arc. */
  spawnCannonballFromTo(fromTile: MapTile, toTile: MapTile, catapult: boolean): Promise<void> {
    const texture = this.host.textures()?.cannonballTexture;
    if (!texture) return Promise.resolve();
    return this.spawnProjectile(fromTile, toTile, texture, 10, catapult ? 2.2 : 1);
  }

  spawnMuzzleSmokeAt(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    spawnMuzzleSmoke(
      app,
      mapRoot,
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
  }

  spawnDeath(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 10;
    const particles: { g: Graphics; x0: number; swing: number; phase: number; opacity: number; delay: number }[] = [];
    for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
      const g = new Graphics();
      const size = 4 + Math.random() * 12;
      const opacity = 0.3 + Math.random() * 0.5;
      g.rect(-size / 2, -size / 2, size, size).fill({ color: 0xffffff, alpha: opacity });
      g.alpha = 0;
      el.addChild(g);
      particles.push({
        g,
        x0: (Math.random() - 0.5) * 24,
        swing: 6 + Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
        opacity,
        delay: Math.random() * DEATH_STAGGER_MS,
      });
    }
    el.position.set(
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
    mapRoot.addChild(el);

    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const age = performance.now() - tickStart;
      for (const p of particles) {
        const localAge = age - p.delay;
        if (localAge <= 0) continue;
        const t = Math.min(1, localAge / DEATH_MS);
        p.g.position.set(p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing, -DEATH_RISE * t);
        p.g.alpha = p.opacity * (1 - t);
      }
      if (age >= DEATH_MS + DEATH_STAGGER_MS) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  spawnFogReveal(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    const textures = this.host.textures();
    if (!app || !mapRoot || !textures) return;
    const fog = textures.fogTopTexture;
    const sprite = new Sprite(fog.texture);
    sprite.anchor.set(0.5, fog.anchorY);
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    sprite.scale.set(camera.spriteScale * scale, camera.spriteScale * scale);
    sprite.position.set(
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
    const el = new Container();
    el.addChild(sprite);
    el.zIndex = 10;
    mapRoot.addChild(el);

    const score = makeLabel(`+${EXPLORED_SCORE}`, { fontSize: FontSize.NORMAL, fill: 0xffffff, fontWeight: '700', roundPixels: false });
    score.anchor.set(0.5, 0.5);
    const fogH = sprite.height;
    score.position.set(
      sprite.position.x,
      sprite.position.y - (fog.anchorY - 0.5) * fogH,
    );
    el.addChild(score);

    const FOG_MS = 900;
    const FOG_RISE = 60;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - tickStart) / FOG_MS);
      el.position.set(0, -FOG_RISE * t);
      el.alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      if (t >= 1) {
        ticker.remove(fn);
        mapRoot.removeChild(el);
        el.destroy();
      }
    };
    ticker.add(fn);
  }

  tweenSpriteTo(sprite: Sprite, to: { x: number; y: number }, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const from = { x: sprite.position.x, y: sprite.position.y };
      const start = performance.now();
      const tick = (): void => {
        const t = Math.min(1, (performance.now() - start) / ms);
        sprite.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        // The render gate skips frames while the scene is static; the walk
        // sprite only moves between those static states, so request a fresh
        // render for every animation frame or the unit would teleport.
        markDirty();
        if (t >= 1) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });
  }
}
