import { Application, BitmapText, Container, Graphics, type TextStyleOptions } from 'pixi.js';
import { FONT_REGULAR } from '../ui/kit/bitmap-fonts';
import { axialKey, hexToPixel } from '../game/hex';
import { tileElevation } from './elevation';
import { resolveCombat, counterDamageTo } from '../game/combat';
import { makeIcon32 } from '../ui/kit/icons32';
import type { GameMap, MapTile } from '../game/map-gen';
import type { Player } from '../game/players';
import type { Unit } from '../game/units';
import type { Viewport } from './tile-signature';

/** Font size of the damage-preview `-N` label. */
const DAMAGE_BADGE_FONT_SIZE = 14;
/** Corner radius of the damage-preview badge rect. */
const DAMAGE_BADGE_RADIUS = 2;
/** Vertical gap between the badge caret tip and the hp text (px). */
const DAMAGE_BADGE_ABOVE_TEXT = 4;
/** Pixels above the hp-bar anchor at which the hp label sits (its bottom). */
const HP_LABEL_UP = 13;
/** Fill color of the badge rect and caret. */
const DAMAGE_BADGE_BG = 0x111111;
/** Whitespace around the badge content (world px). */
const DAMAGE_BADGE_PADDING = 5;
/** Gap between the attack icon and the `-N hp` text. */
const DAMAGE_BADGE_ICON_GAP = 3;
/** Attack icon size inside the damage-preview badge. */
const DAMAGE_BADGE_ICON_SIZE = 14;
/** Height of the caret triangle under the badge. */
const DAMAGE_BADGE_CARET = 5;
/** Width of the caret triangle under the badge. */
const DAMAGE_BADGE_CARET_W = 9;
/** Duration of the badge in/out animation (ms). */
const DAMAGE_BADGE_ANIM_MS = 80;
/** Overlay z-index for damage preview badges: above hp bars, village name
 *  labels and capture markers so the badge is never covered by them. */
const DAMAGE_BADGE_Z_INDEX = 100;
/** World offset of the unit hp-bar anchor above the tile's unit top; the
 *  badge anchors to the hp bar point just like the hp bar itself. */
const HP_BAR_ANCHOR_OFFSET = 40;

/** Services a damage-badge layer needs from the map view that hosts it. */
export interface DamageBadgeLayerOptions {
  app: Application;
  /** Unscaled, zoom-independent overlay the badges render into. */
  overlay: Container;
  hexSize: number;
  getMap: () => GameMap | null;
  getTileIndex: () => Map<string, MapTile>;
  getViewport: () => Viewport | null;
  /** Current hp-label height, measured while the first hp bar of a frame is
   *  drawn; the badge sits above the hp text, so its offset depends on it. */
  getHpLabelHeight: () => number;
  /** World height of a unit's sprite top above the hex centre (sprite anchor
   *  + scale) — the badge anchors to the same point as the unit's hp bar. */
  unitTextureTop: (unit: Unit, players: Player[]) => number;
}

/** Screen-space expected-damage preview badges over the attacker and target,
 *  rendered into the unscaled overlay so they stay zoom-independent like HP
 *  bars. The preview is armed by `show`, drawn by `render` on each map redraw,
 *  re-positioned every frame by `syncPositions`, and fades out on `hide`. */
export class DamageBadgeLayer {
  private readonly overlay: Container;
  private readonly hexSize: number;
  private previewFor: { attacker: Unit; target: MapTile } | null = null;
  private attackerVisible = false;
  private attackerTimer: ReturnType<typeof setTimeout> | null = null;
  /** Badge elements currently on screen (settled or animating). */
  private liveBadges = new Set<Container>();
  /** World anchors for damage badges in overlay (screen-space position tracking). */
  private anchors = new Map<Container, { worldX: number; worldY: number; screenOffsetY: number }>();
  /** Outer badge wrapper per tile key: a preview re-render reuses the settled
   *  badge for a tile instead of tearing it down and fading it again from 0. */
  private badgeByKey = new Map<string, Container>();
  /** Badge elements in an active fade phase. */
  private badgeAnim = new Map<Container, { phase: 'in' | 'out'; start: number }>();
  private badgeAnimRemove: (() => void) | null = null;

  constructor(private readonly opts: DamageBadgeLayerOptions) {
    this.overlay = opts.overlay;
    this.hexSize = opts.hexSize;
  }

  /** Arming a preview from `attacker` against `target` (an enemy standing on
   *  a tile). The badges are rendered the next time `render` runs, so a caller
   *  usually arms then triggers a re-render. The counter-attack badge appears
   *  100ms after the target badge. `onRender` is called after the delay to
   *  trigger the next render pass. */
  show(attacker: Unit, target: MapTile, onRender?: () => void): void {
    this.previewFor = { attacker, target };
    this.attackerVisible = false;
    if (this.attackerTimer !== null) {
      clearTimeout(this.attackerTimer);
      this.attackerTimer = null;
    }
    this.attackerTimer = setTimeout(() => {
      this.attackerVisible = true;
      onRender?.();
    }, 100);
  }

  /** Drop the expected-damage preview. Cleared again on the next render. */
  hide(): void {
    this.previewFor = null;
    this.attackerVisible = false;
    if (this.attackerTimer !== null) {
      clearTimeout(this.attackerTimer);
      this.attackerTimer = null;
    }
    this.animateOut();
  }

  /** Update overlay badge positions to follow the camera. Called every frame
   *  from the host transform so badges track world-anchored positions without
   *  being affected by zoom scaling. */
  syncPositions(pan: { x: number; y: number }, scale: number): void {
    for (const [outer, { worldX, worldY, screenOffsetY }] of this.anchors) {
      if (outer.destroyed) {
        this.anchors.delete(outer);
        continue;
      }
      outer.position.set(pan.x + worldX * scale, pan.y + worldY * scale + screenOffsetY);
    }
  }

  /** Renders the `-N` badges over the attacker's and target's hp bars for the
   *  armed damage preview. Idempotent, so it can be redrawn on every update
   *  while the preview is held. */
  render(players: Player[], localPlayerIndex: number): void {
    const preview = this.previewFor;
    const map = this.opts.getMap();
    if (!preview || !map) return;
    const targetUnit = preview.target.unit;
    if (!targetUnit) return;
    const attackerTile = this.opts.getTileIndex().get(axialKey({ q: preview.attacker.q, r: preview.attacker.r }));
    if (!attackerTile || attackerTile.unit !== preview.attacker) return;

    const { attackerDamage } = resolveCombat(map, preview.attacker, preview.target);
    // Badge over the long-pressed enemy: what the selected unit would deal.
    // A lethal hit (damage >= target hp) shows the skull icon; 0 damage shows
    // nothing.
    if (attackerDamage > 0) {
      this.addBadge(preview.target, targetUnit, players, attackerDamage, localPlayerIndex, attackerDamage >= targetUnit.hp);
    }
    // Badge over the selected unit: the counter it would take, delayed 100ms
    // so the player sees the target badge first. Mirrors a real attack: the
    // counter only lands when the target survives, is in range, and can
    // counter-attack — otherwise no retaliation badge is shown.
    const counterDamage = counterDamageTo(map, preview.attacker, preview.target);
    if (counterDamage > 0 && this.attackerVisible) {
      this.addBadge(attackerTile, preview.attacker, players, counterDamage, localPlayerIndex, counterDamage >= preview.attacker.hp);
    }
  }

  /** Drop settled badges that are not mid-animation. A preview re-render
   *  rebuilds the overlay; badges that belong to a live preview are then
   *  reused by `render` instead (a fade-out keeps running across the rebuild
   *  via `badgeAnim`). Called on every overlay rebuild. */
  dropSettled(): void {
    if (this.previewFor) return;
    for (const [outer] of this.anchors) {
      if (this.badgeAnim.has(outer.children[0] as Container)) continue;
      this.liveBadges.delete(outer);
      for (const [k, o] of this.badgeByKey) if (o === outer) this.badgeByKey.delete(k);
      outer.destroy({ children: true });
      this.anchors.delete(outer);
    }
  }

  destroy(): void {
    this.liveBadges.clear();
    this.anchors.clear();
    this.badgeByKey.clear();
    this.badgeAnim.clear();
    this.stopTick();
    this.previewFor = null;
    this.attackerVisible = false;
    if (this.attackerTimer !== null) {
      clearTimeout(this.attackerTimer);
      this.attackerTimer = null;
    }
  }

  /** Starts the fade-out for every badge still on screen: flips its phase so
   *  the shared ticker runs it to completion (a rebuild skips animating ones,
   *  so an overlay rebuild never kills the fade mid-flight). */
  private animateOut(): void {
    const now = performance.now();
    let changed = false;
    for (const outer of this.liveBadges) {
      if (outer.destroyed) continue;
      const el = outer.children[0] as Container;
      changed = true;
      this.badgeAnim.set(el, { phase: 'out', start: now });
    }
    if (!changed) return;
    this.ensureTick();
  }

  /** A tooltip-style damage badge: a `#111` rounded rect with no stroke, an
   *  attack (or skull on a lethal hit) icon (14px) + white `-N` text, and a
   *  small `#111` caret pointing down at the bottom — rendered in screen-space
   *  overlay so it stays zoom-independent (just like unit HP bars). */
  private addBadge(tile: MapTile, unit: Unit, players: Player[], n: number, localPlayerIndex: number, kill = false): void {
    const key = axialKey(tile);
    // A preview re-render re-runs render(): reuse the badge already shown on
    // this tile (settled or mid fade-in) so it does not blink back to alpha 0.
    // A badge mid fade-out belongs to a dismissed preview and is replaced by
    // the fresh one.
    const existing = this.badgeByKey.get(key);
    if (existing && !existing.destroyed) {
      const existingEl = existing.children[0] as Container;
      const anim = this.badgeAnim.get(existingEl);
      if (!anim || anim.phase === 'in') return;
    }
    const p = hexToPixel(tile, this.hexSize);
    const y = p.y - tileElevation(tile, this.hexSize);
    const center = this.opts.unitTextureTop(unit, players);
    const anchor = { x: p.x, y: y - center + HP_BAR_ANCHOR_OFFSET };

    const label = new BitmapText({
      text: `-${n}`,
      style: {
        fontSize: DAMAGE_BADGE_FONT_SIZE,
        fill: 0xffffff,
        fontFamily: FONT_REGULAR,
      },
    });
    label.anchor.set(0.5, 0.5);

    const iconKey = kill ? 'skull-32' : 'attack-32';
    const icon = makeIcon32(iconKey, DAMAGE_BADGE_ICON_SIZE);
    icon.label = iconKey;
    icon.anchor.set(0.5, 0.5);

    const gap = DAMAGE_BADGE_ICON_GAP;
    const contentW = label.width + gap + icon.width;
    const contentH = Math.max(label.height, icon.height);
    const pad = DAMAGE_BADGE_PADDING;
    const bw = contentW + pad * 2;
    const bh = contentH + pad * 2;

    const g = new Graphics();
    g.roundRect(-bw / 2, -bh / 2, bw, bh, DAMAGE_BADGE_RADIUS).fill(DAMAGE_BADGE_BG);
    // Caret at the bottom center, pointing down, its base flush with the rect
    // bottom edge (zero spacing between the triangle and the rect).
    g.poly([-DAMAGE_BADGE_CARET_W / 2, bh / 2, DAMAGE_BADGE_CARET_W / 2, bh / 2, 0, bh / 2 + DAMAGE_BADGE_CARET])
      .fill(DAMAGE_BADGE_BG);

    // Layout: [icon] gap [text] centered horizontally.
    icon.position.set(-contentW / 2 + icon.width / 2, 0);
    label.position.set(contentW / 2 - label.width / 2, 0);

    // Screen-space offset from the anchor: caret tip sits DAMAGE_BADGE_ABOVE_TEXT
    // px above the hp text top (= HP_LABEL_UP + hpLabelHeight above anchor).
    const screenOffsetY = -(HP_LABEL_UP + this.opts.getHpLabelHeight() + DAMAGE_BADGE_ABOVE_TEXT + bh / 2 + DAMAGE_BADGE_CARET);

    const outer = new Container();
    const el = new Container();
    el.addChild(g, icon, label);
    outer.addChild(el);
    // Initial screen position from the current viewport; syncPositions keeps
    // it updated every frame after the camera moves.
    const viewport = this.opts.getViewport();
    if (viewport) {
      outer.position.set(
        viewport.x + anchor.x * viewport.scale,
        viewport.y + anchor.y * viewport.scale + screenOffsetY,
      );
    }
    // Render in the unscaled overlay (zoom-independent, like HP bars).
    // Position is set every frame by syncPositions.
    outer.zIndex = DAMAGE_BADGE_Z_INDEX;
    this.overlay.addChild(outer);
    this.anchors.set(outer, { worldX: anchor.x, worldY: anchor.y, screenOffsetY });
    this.liveBadges.add(outer);
    this.badgeByKey.set(key, outer);
    // Fade the badge in (alpha only; the outer tracks the world position via
    // syncPositions).
    el.alpha = 0;
    this.badgeAnim.set(el, { phase: 'in', start: performance.now() });
    this.ensureTick();
  }

  private ensureTick(): void {
    if (this.badgeAnimRemove) return;
    const fn = (): void => {
      const now = performance.now();
      if (this.badgeAnim.size === 0) {
        if (this.badgeAnimRemove === remover) this.stopTick();
        return;
      }
      for (const [el, anim] of this.badgeAnim) {
        if (el.destroyed || el.parent?.destroyed) {
          this.badgeAnim.delete(el);
          if (el.parent) this.liveBadges.delete(el.parent as Container);
          else this.liveBadges.delete(el as Container);
          continue;
        }
        const t = Math.min(1, (now - anim.start) / DAMAGE_BADGE_ANIM_MS);
        if (anim.phase === 'in') {
          el.alpha = t;
          if (t >= 1) {
            el.alpha = 1;
            this.badgeAnim.delete(el);
          }
        } else {
          el.alpha = 1 - t;
          if (t >= 1) {
            const outer = el.parent as Container | undefined;
            if (outer) {
              if (outer.parent) outer.parent.removeChild(outer);
              this.anchors.delete(outer);
              for (const [k, o] of this.badgeByKey) if (o === outer) this.badgeByKey.delete(k);
              outer.destroy({ children: true });
            }
            this.badgeAnim.delete(el);
            this.liveBadges.delete(outer!);
          }
        }
      }
      if (this.badgeAnim.size === 0) {
        if (this.badgeAnimRemove === remover) this.stopTick();
      }
    };
    const remover = (): void => {
      this.opts.app.ticker.remove(fn);
    };
    this.opts.app.ticker.add(fn);
    this.badgeAnimRemove = remover;
  }

  private stopTick(): void {
    if (this.badgeAnimRemove) {
      const fn = this.badgeAnimRemove;
      this.badgeAnimRemove = null;
      fn();
    }
  }
}