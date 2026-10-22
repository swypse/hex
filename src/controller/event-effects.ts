import { BitmapText, ColorMatrixFilter, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { type MapTile } from '../game/map/map-gen';
import { isExploredFor } from '../game/map/explore';
import { hexDistance, hexToPixel } from '../game/map/hex';
import { tileElevation } from '../render/elevation';
import { spawnMuzzleSmoke } from '../render/smoke';
import { drawLightning } from '../render/lightning';
import { THEME } from '../gfx/theme';
import { useGameStore } from '../store/game-store';
import { EXPLORED_SCORE } from '../game/score';
import { makeLabel } from '../gfx/label';
import { makeIcon32 } from '../gfx/icons32';
import { FONT_BLACK, FONT_REGULAR, sizedFontFamily } from '../gfx/bitmap-fonts';
import { markDirty } from '../gfx/render-gate';
import { FontSize } from '@enums';

import type { EventHost } from './event-presenter';

const HEX_SIZE = 40;
/** Side of the resource icon in a floating income label. */
const INCOME_ICON_SIZE = 16;
/** Dark plate behind an income or score label: alpha, padding (px) and corner radius. */
const FLOAT_BG_ALPHA = 0.6;
const FLOAT_BG_PAD_X = 4;
const FLOAT_BG_PAD_Y = 2;
const FLOAT_BG_RADIUS = 2;
/** Resources a floating income label can show, in display order, with their 32px icon. */
const INCOME_PARTS = [
  { key: 'money', icon: 'gold-32' },
  { key: 'wood', icon: 'wood-32' },
  { key: 'stone', icon: 'stone-32' },
  { key: 'ore', icon: 'ore-32' },
  { key: 'food', icon: 'food-32' },
] as const;
const DEATH_PARTICLE_COUNT = 10;
const DEATH_RISE = 200;
const DEATH_MS = 3000;
const DEATH_STAGGER_MS = 700;
/** Damage number: text size grows with the damage (each step is a baked `FontSize`).
 *  With an attacker it is thrown from the victim along the attack direction on an
 *  arc while fading out; otherwise (starvation, weather, traps) it just floats up. */
const DAMAGE_SIZE_STEPS = [
  { from: 20, size: FontSize.BIG },
  { from: 8, size: FontSize.NORMAL },
  { from: 0, size: FontSize.SMALL },
] as const;
const DAMAGE_ARC_SPREAD = 38;
const DAMAGE_ARC_HEIGHT = 30;
const DAMAGE_MS = 1000;
/** Above the overlay's unit mirrors (-1) and attack markers (-0.5), below hp bars (0). */
const RAYS_OVERLAY_Z = -0.25;
const RAYS_COUNT = 12;
const RAYS_MS = 700;
const RAYS_INNER = 8;
const RAYS_OUTER = 52;
const RAYS_COLOR = 0xffe680;
export const RAYS_DAMAGE_COLOR = 0xff2a2a;
/** Score points start this long after the damage number so the -N shows first. */
const SCORE_FLY_DELAY_MS = 50;
/** Lightning bolt visibility; the map and background flash inverted `LIGHTNING_FLASHES` times,
 *  `LIGHTNING_INVERT_MS` each, one flash per `LIGHTNING_FLASH_PERIOD_MS`. */
const LIGHTNING_MS = 200;
const LIGHTNING_FLASHES = 3;
const LIGHTNING_INVERT_MS = 20;
const LIGHTNING_FLASH_PERIOD_MS = 50;
/** Arrow projectile flight time for the archer attack animation (ms). */
const PROJECTILE_MS_PER_TILE = 150;

export type EffectsHost = Pick<EventHost, 'app' | 'mapRoot' | 'mapView' | 'textures' | 'camera'>;

/** One-off visual effects the presenter plays at map tiles: floating text, projectiles, deaths, fog reveals. */
export class EventEffects {
  constructor(private readonly host: EffectsHost) {}

  /** Current screen position of `tile`'s center under the live camera. */
  private tileScreenPos(camera: ReturnType<EffectsHost['camera']>, tile: MapTile): { x: number; y: number } {
    const world = hexToPixel(tile, HEX_SIZE);
    return {
      x: camera.pan.x + world.x * camera.scale,
      y: camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * camera.scale,
    };
  }

  spawnScoreFly(tile: MapTile, playerIndex: number, amount: number): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (playerIndex !== local && !isExploredFor(tile, local)) return;
    // Let the -N damage number appear first.
    setTimeout(() => this.floatUp(tile, [{ text: `+${amount}`, color: 0xffd700 }], { background: true }), SCORE_FLY_DELAY_MS);
  }

  /** Floating hp text at `tile`; for damage, `from` is the attacker's tile the number is thrown away from. */
  spawnHpText(tile: MapTile, text: string, color: number, from?: MapTile): void {
    const local = useGameStore.getState().localPlayerIndex;
    if (!isExploredFor(tile, local)) return;
    const damage = /^-(\d+)$/.exec(text);
    if (damage) {
      const amount = Number(damage[1]);
      const size = DAMAGE_SIZE_STEPS.find((step) => amount >= step.from)!.size;
      this.floatUp(tile, [{ text, color }], { fontSize: size, throwDir: from ? this.throwDirection(from, tile) : null });
      return;
    }
    this.spawnFloatText(tile, text, color);
  }

  /** Unit screen vector from `from` to `to` (null when they coincide). */
  private throwDirection(from: MapTile, to: MapTile): { x: number; y: number } | null {
    const camera = this.host.camera();
    const a = this.tileScreenPos(camera, from);
    const b = this.tileScreenPos(camera, to);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return len > 0 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : null;
  }

  spawnFloatText(tile: MapTile, text: string, color: number): void {
    this.floatUp(tile, [{ text, color }]);
  }

  /** Round-end income: one label of "<icon> N" parts (money, wood, stone + ore, food) lifting up from the tile. */
  spawnIncomeFly(tile: MapTile, income: Partial<Record<'money' | 'wood' | 'stone' | 'ore' | 'food', number>>, delayMs = 0): void {
    const parts = INCOME_PARTS
      .filter(({ key }) => (income[key] ?? 0) > 0)
      .map(({ key, icon }) => ({ icon, text: String(income[key]), color: 0xffffff }));
    if (parts.length === 0) return;
    if (delayMs > 0) setTimeout(() => this.floatUp(tile, parts, { background: true }), delayMs);
    else this.floatUp(tile, parts, { background: true });
  }

  /** Lifts a row of optional-icon + text parts up from `tile` and fades it out
   *  (`throwDir`: flies off along that screen direction on an arc instead). */
  private floatUp(
    tile: MapTile,
    parts: { text: string; color: number; icon?: string }[],
    { background: withBackground = false, fontSize = FontSize.SMALL, throwDir = null }: { background?: boolean; fontSize?: FontSize; throwDir?: { x: number; y: number } | null } = {},
  ): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const el = new Container();
    el.zIndex = 10;
    const row = new Container();
    let x = 0;
    let rowH = INCOME_ICON_SIZE;
    for (const part of parts) {
      if (part.icon) {
        const icon = makeIcon32(part.icon, INCOME_ICON_SIZE);
        icon.anchor.set(0, 0.5);
        icon.position.set(x, 0);
        row.addChild(icon);
        x += INCOME_ICON_SIZE + 2;
      }
      const label = new BitmapText({
        text: part.text,
        // Plated badges (income, score) use the regular weight; plain hp numbers stay bold.
        style: { fontFamily: sizedFontFamily(withBackground ? FONT_REGULAR : FONT_BLACK, fontSize), fontSize, fill: part.color },
      });
      label.anchor.set(0, 0.5);
      label.position.set(x, 0);
      row.addChild(label);
      rowH = Math.max(rowH, label.height);
      x += label.width + 6;
    }
    const rowW = x - 6;
    // Centre the row on the hex.
    row.position.set(-rowW / 2, 0);
    if (withBackground) {
      const bg = new Graphics();
      bg.roundRect(-rowW / 2 - FLOAT_BG_PAD_X, -rowH / 2 - FLOAT_BG_PAD_Y, rowW + FLOAT_BG_PAD_X * 2, rowH + FLOAT_BG_PAD_Y * 2, FLOAT_BG_RADIUS)
        .fill({ color: 0x000000, alpha: FLOAT_BG_ALPHA });
      el.addChild(bg);
    }
    el.addChild(row);
    const start = this.tileScreenPos(camera, tile);
    el.position.set(start.x, start.y);
    mapRoot.addChild(el);

    const FLOAT_RISE = 44;
    const FLOAT_MS = throwDir ? DAMAGE_MS : 900;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      // The map was torn down (exit to menu) mid-animation.
      if (el.destroyed) {
        ticker.remove(fn);
        return;
      }
      const t = Math.min(1, (performance.now() - tickStart) / FLOAT_MS);
      // Re-read the camera each frame so the number stays glued to its hex.
      const at = this.tileScreenPos(camera, tile);
      if (throwDir) {
        // Thrown along the attack vector, lofted on an arc.
        const dx = throwDir.x * DAMAGE_ARC_SPREAD * t;
        const dy = throwDir.y * DAMAGE_ARC_SPREAD * t - DAMAGE_ARC_HEIGHT * 4 * t * (1 - t);
        el.position.set(at.x + dx * camera.scale, at.y + dy * camera.scale);
        el.alpha = t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
      } else {
        el.position.set(at.x, at.y - FLOAT_RISE * t);
        el.alpha = t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
      }
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
        // The map was torn down (exit to menu) mid-flight: just unblock the awaiting presenter.
        if (sprite.destroyed) {
          finished = true;
          ticker.remove(fn);
          resolve();
          return;
        }
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
    const mapView = this.host.mapView();
    if (!app || !mapView) return;
    const world = hexToPixel(tile, HEX_SIZE);
    // Parented to the camera-transformed map container: the puff stays on its cell while panning/zooming.
    spawnMuzzleSmoke(app, mapView.container, world.x, world.y - tileElevation(tile, HEX_SIZE), 1 / this.host.camera().scale);
  }

  spawnDeath(tile: MapTile): void {
    const app = this.host.app();
    const mapView = this.host.mapView();
    if (!app || !mapView) return;
    const mapRoot = mapView.container;
    const world = hexToPixel(tile, HEX_SIZE);
    const el = new Container();
    el.zIndex = 12;
    // Map-bound: parented to the camera-transformed container at unit scale, so
    // the particles grow and shrink with the map zoom.
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
    el.position.set(world.x, world.y - tileElevation(tile, HEX_SIZE));
    mapRoot.addChild(el);

    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      // The map was torn down (exit to menu) mid-animation.
      if (el.destroyed) {
        ticker.remove(fn);
        return;
      }
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

  /** Golden rays radiating from the centre of `tile` (bonus claim): each ray
   *  is a thin tapered wedge that slides outward, then fades. */
  spawnRays(tile: MapTile, color = RAYS_COLOR): void {
    const app = this.host.app();
    const mapView = this.host.mapView();
    if (!app || !mapView) return;
    // Drawn in the screen-space overlay: village units are mirrored there above
    // the map layer, so rays in the map container would sit under the unit.
    const overlay = mapView.overlay;
    const mapRoot = mapView.container;
    const world = hexToPixel(tile, HEX_SIZE);
    const anchor = { x: world.x, y: world.y - tileElevation(tile, HEX_SIZE) };
    const el = new Container();
    el.zIndex = RAYS_OVERLAY_Z;
    const offset = Math.random() * Math.PI;
    const rays: Graphics[] = [];
    for (let i = 0; i < RAYS_COUNT; i++) {
      const g = new Graphics();
      // Pointing along +x: wide at the base, a point at the tip.
      g.poly([0, -2.5, 18, 0, 0, 2.5]).fill(color);
      g.rotation = offset + (i / RAYS_COUNT) * Math.PI * 2;
      // Alternate long and short rays.
      g.scale.set(i % 2 === 0 ? 1 : 0.65);
      el.addChild(g);
      rays.push(g);
    }
    overlay.addChild(el);

    const start = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      if (el.destroyed) {
        ticker.remove(fn);
        return;
      }
      // Follow the cell through camera pan and zoom.
      const pos = overlay.toLocal(anchor, mapRoot);
      el.position.set(pos.x, pos.y);
      // The rays are map art: they grow and shrink with the map zoom.
      el.scale.set(mapRoot.scale.x);
      const t = Math.min(1, (performance.now() - start) / RAYS_MS);
      const eased = 1 - (1 - t) * (1 - t);
      const dist = RAYS_INNER + (RAYS_OUTER - RAYS_INNER) * eased;
      for (const g of rays) {
        g.position.set(Math.cos(g.rotation) * dist, Math.sin(g.rotation) * dist);
        g.alpha = t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6;
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

  spawnFogReveal(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    const textures = this.host.textures();
    if (!app || !mapRoot || !textures) return;
    const fog = textures.fogTopTexture;
    const sprite = new Sprite(fog.texture);
    sprite.anchor.set(0.5, fog.anchorY);
    const camera = this.host.camera();
    const el = new Container();
    el.addChild(sprite);
    el.zIndex = 10;
    mapRoot.addChild(el);

    const score = makeLabel(`+${EXPLORED_SCORE}`, { fontSize: FontSize.VERY_SMALL, fill: 0xffffff, fontWeight: '700', roundPixels: false });
    score.anchor.set(0.5, 0.5);
    el.addChild(score);
    // Sprite and label follow the hex through camera pan and zoom.
    const place = (): void => {
      const at = this.tileScreenPos(camera, tile);
      sprite.scale.set(camera.spriteScale * camera.scale);
      sprite.position.set(at.x, at.y);
      score.position.set(at.x, at.y - (fog.anchorY - 0.5) * sprite.height);
    };
    place();

    const FOG_MS = 900;
    const FOG_RISE = 60;
    const tickStart = performance.now();
    const ticker = app.ticker;
    const fn = (): void => {
      // The map was torn down (exit to menu) mid-animation.
      if (el.destroyed) {
        ticker.remove(fn);
        return;
      }
      const t = Math.min(1, (performance.now() - tickStart) / FOG_MS);
      place();
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

  /** A white lightning bolt from the top of the screen to `tile`, visible for
   *  `LIGHTNING_MS`; the map and the background are color-inverted for the first
   *  `LIGHTNING_INVERT_MS`. Resolves once everything is restored. */
  playLightning(tile: MapTile): Promise<void> {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return Promise.resolve();
    const camera = this.host.camera();
    const world = hexToPixel(tile, HEX_SIZE);
    const target = {
      x: camera.pan.x + world.x * camera.scale,
      y: camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * camera.scale,
    };
    const bolt = new Graphics();
    drawLightning(bolt, { x: target.x + (Math.random() - 0.5) * 60, y: -10 }, target);
    // Above the map but not inside it, so the inversion leaves the bolt white.
    const parent = mapRoot.parent ?? app.stage;
    parent.addChildAt(bolt, mapRoot.parent ? parent.getChildIndex(mapRoot) + 1 : parent.children.length);
    const filter = new ColorMatrixFilter();
    filter.negative(false);
    const background = app.renderer.background;
    const setInverted = (on: boolean): void => {
      if (!mapRoot.destroyed) mapRoot.filters = on ? [filter] : [];
      background.color = on ? 0xffffff - THEME.bg : THEME.bg;
    };
    return new Promise<void>((resolve) => {
      const start = performance.now();
      let inverted = false;
      const finish = (): void => {
        setInverted(false);
        if (!bolt.destroyed) {
          bolt.parent?.removeChild(bolt);
          bolt.destroy();
        }
        markDirty();
        resolve();
      };
      const tick = (): void => {
        const elapsed = performance.now() - start;
        const flashing = elapsed < LIGHTNING_FLASHES * LIGHTNING_FLASH_PERIOD_MS && elapsed % LIGHTNING_FLASH_PERIOD_MS < LIGHTNING_INVERT_MS;
        if (flashing !== inverted) {
          inverted = flashing;
          setInverted(flashing);
        }
        markDirty();
        if (elapsed >= LIGHTNING_MS) finish();
        else requestAnimationFrame(tick);
      };
      tick();
    });
  }

  tweenSpriteTo(sprite: Sprite, to: { x: number; y: number }, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const from = { x: sprite.position.x, y: sprite.position.y };
      const start = performance.now();
      const tick = (): void => {
        // Map torn down mid-tween (exit to menu): stop and unblock the caller.
        if (sprite.destroyed) {
          resolve();
          return;
        }
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
