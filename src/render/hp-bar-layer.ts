import { Application, BitmapText, Container, Graphics, Sprite } from 'pixi.js';
import type { ObjectPool } from './object-pool';
import type { TextureSet } from './texture-factory';
import { FONT_OUTLINED } from '../gfx/bitmap-fonts';
import { HP_BAR_BOX_TOP, HP_BAR_HEIGHT, HP_BAR_INNER_W, HP_BAR_OUTER_H, HP_BAR_OUTER_W, HP_BAR_PADDING, HP_LABEL_GAP, HP_LABEL_PAD_X, HP_LABEL_PLATE_GAP } from './hp-bar-layout';
import { makeIcon32 } from '../gfx/icons32';
import { FontSize, HpBarSide } from '@enums';
import { clamp, clamp01 } from '../util/math';

const HP_BAR_GREEN = 0x49cc5d;
/** Fill colour of the inner hp box by owner: enemies red, everyone else green. */
const HP_BAR_FILL: Record<HpBarSide, number> = {
  [HpBarSide.OWN]: HP_BAR_GREEN,
  [HpBarSide.ENEMY]: 0xe04848,
  [HpBarSide.NEUTRAL]: HP_BAR_GREEN,
};
const HP_BAR_GHOST = 0xfa9a09;
const HP_BAR_GREEN_MS = 100;
const HP_BAR_GHOST_MS = 300;
/** After a damage animation settles, an up-swing back to the exact pre-damage
 *  hp within this window is combat re-hydration (the presenter re-stages units
 *  at their pre-attack hp), not a heal. */
const HP_RESTAGE_WINDOW_MS = 1000;
/** Veteran star icon size and its gap to the hp text. */
const VETERAN_STAR_SIZE = 12;
const VETERAN_STAR_GAP = 2;
/** Attack-bonus marker after the hp text: icon size, gap before the icon and gap before the +N text. */
const BONUS_ICON_SIZE = 16;
const BONUS_ICON_GAP = 1;
const BONUS_TEXT_GAP = 0;
/** Opacity of the hp text and attack-bonus marker of a unit that cannot act (the veteran star stays opaque). */
const HP_LABEL_DIM_ALPHA = 0.5;

/** What the HP bar layer needs to draw one bar for a unit or a building. */
export interface HpBarSpec {
  key: string;
  world: { x: number; y: number };
  hp: number;
  maxHp: number;
  label: string;
  dim: boolean;
  bonus: number;
  /** The unit gets too little food: show a red S before the hp text. */
  starving?: boolean;
  /** A veteran: a star icon before the hp text. */
  veteran?: boolean;
  /** Whose bar it is (colour of the hp fill); neutral when unset. */
  side?: HpBarSide;
}

/** A persistent unit/building hp bar: a white 62x12 box holding an orange
 *  ghost bar and a green bar (60x10 at full hp). On damage both shrink to the
 *  remaining hp: green over 100ms, ghost over 300ms (the classic trail). */
interface HpBarEntry {
  el: Container;
  world: { x: number; y: number };
  bg: Graphics;
  /** Whose bar it is now (a captured building changes side): picks the fill colour. */
  side: HpBarSide;
  ghost: Graphics;
  green: Graphics;
  label: BitmapText;
  bonusIcon: Sprite | null;
  bonusText: BitmapText | null;
  /** Red "S" before the hp text of a starving unit. */
  starveTag: BitmapText | null;
  /** Star icon before the hp text of a veteran. */
  star: Sprite | null;
  greenW: number;
  ghostW: number;
  greenAnim: { from: number; to: number; start: number } | null;
  ghostAnim: { from: number; to: number; start: number } | null;
  lastHp: number;
  /** The hp the bar showed just before its current damage animation (used to
   *  spot combat re-hydration to the pre-attack hp, so the bar does not bounce
   *  back up mid-fight). */
  damageFromHp: number | undefined;
  /** Clamp time (`performance.now()`) when the last damage animation settled;
   *  re-hydration is only honoured within the window after this. */
  lastSettleAt: number;
}

/** A `stage:`-prefixed unit id (combat staging) refers to the same entity as
 *  the real unit; map both to the real id's hp bar key. */
function normalizeHpBarKey(key: string): string {
  return key.startsWith('stage:') ? key.slice('stage:'.length) : key;
}

export interface HpBarLayerDeps {
  app: Application;
  overlay: () => Container;
  textures: () => TextureSet;
  pool: ObjectPool;
}

/** The persistent hp bars of units and buildings: creation, damage animation and positioning. */
export class HpBarLayer {
  private readonly bars = new Map<string, HpBarEntry>();
  private tickRemove: (() => void) | null = null;
  /** Height of an hp label (all labels share one font), measured from the latest bar. */
  labelHeight = 0;

  constructor(private readonly deps: HpBarLayerDeps) {}

  /** Reconciles the persistent hp bars with the visible units/buildings:
   *  creates bars for new keys, destroys bars whose unit/building vanished,
   *  and starts the damage animation whenever a bar's hp drops. */
  sync(specs: HpBarSpec[]): void {
    const seen = new Set<string>();
    for (const spec of specs) {
      // Combat stages each involved unit under a `stage:` id while the lunge
      // plays; a staged unit is the SAME entity as its real unit, so its bar
      // keeps the real one's registry key (otherwise the real bar would be
      // destroyed and recreated mid-fight, replaying the damage animation).
      const key = normalizeHpBarKey(spec.key);
      seen.add(key);
      let bar = this.bars.get(key);
      if (!bar) {
        bar = this.createHpBar(spec);
        this.bars.set(key, bar);
        this.deps.overlay().addChild(bar.el);
      }
      bar.world = spec.world;
      bar.el.position.set(spec.world.x, spec.world.y);
      const ratio = spec.maxHp > 0 ? clamp01(spec.hp / spec.maxHp) : 1;
      const innerW = (w: number) => clamp(w, 0, HP_BAR_INNER_W);
      const targetW = innerW(HP_BAR_INNER_W * ratio);
      if (spec.hp < bar.lastHp) {
        // Damage: green drops to the new hp fast, the orange ghost trails it.
        const now = performance.now();
        bar.damageFromHp = bar.lastHp;
        bar.greenAnim = { from: bar.greenW, to: targetW, start: now };
        bar.ghostAnim = { from: bar.ghostW, to: targetW, start: now };
        bar.lastHp = spec.hp;
        this.ensureTick();
      } else if (spec.hp > bar.lastHp) {
        // A higher hp here is either a genuine heal or a transient combat
        // re-hydration: staging runs each unit at its pre-attack hp, so while a
        // damage animation is live (or the value is that very pre-hp shortly
        // after it settled) the bar must not bounce back up. Otherwise snap up.
        const ghostLive = bar.greenAnim !== null || bar.ghostAnim !== null;
        const rehydratesPre =
          bar.damageFromHp !== undefined &&
          spec.hp === bar.damageFromHp &&
          performance.now() - bar.lastSettleAt < HP_RESTAGE_WINDOW_MS;
        if (!ghostLive && !rehydratesPre) {
          bar.greenAnim = null;
          bar.ghostAnim = null;
          bar.greenW = targetW;
          bar.ghostW = targetW;
          bar.lastHp = spec.hp;
          bar.damageFromHp = undefined;
          bar.lastSettleAt = 0;
        }
      } else if (!bar.greenAnim && !bar.ghostAnim && (bar.greenW !== targetW || bar.ghostW !== targetW)) {
        // The unit sits at the same hp as last frame but the bar's width is
        // stale (a freshly created bar starts at the damage target, or the
        // value changed through hp overrides/re-hydration). Keep the bar
        // honest to the actual hp instead of leaving it frozen at 100%.
        bar.greenW = targetW;
        bar.ghostW = targetW;
      }
      bar.side = spec.side ?? HpBarSide.NEUTRAL;
      this.updateHpBarLabel(bar, spec);
      this.drawHpBars(bar);
    }
    for (const [key, bar] of this.bars) {
      if (seen.has(key)) continue;
      bar.greenAnim = null;
      bar.ghostAnim = null;
      bar.el.parent?.removeChild(bar.el);
      bar.el.destroy({ children: true });
      this.bars.delete(key);
    }
    if (this.bars.size === 0) this.stopTick();
  }

  private createHpBar(spec: HpBarSpec): HpBarEntry {
    const el = new Container();
    el.sortableChildren = true;
    // The white box ends just above the anchor (see hp-bar-layout); the
    // green/ghost bars fill its inner area (1px padding); the label's bottom
    // sits HP_LABEL_GAP above the box top.
    const boxTop = HP_BAR_BOX_TOP;

    const bg = new Graphics();
    bg.zIndex = 0;
    bg.rect(-HP_BAR_OUTER_W / 2, boxTop, HP_BAR_OUTER_W, HP_BAR_OUTER_H).fill(0xffffff);
    el.addChild(bg);

    const ghost = new Graphics();
    ghost.zIndex = 1;
    el.addChild(ghost);

    const green = new Graphics();
    green.zIndex = 2;
    el.addChild(green);

    const label = this.deps.pool.takeText(spec.label, {
      fontSize: FontSize.VERY_SMALL,
      fill: 0xffffff,
      fontFamily: FONT_OUTLINED,
    });
    label.anchor.set(0.5, 1);
    label.position.set(0, boxTop - HP_LABEL_GAP);
    label.zIndex = 1;
    this.labelHeight = label.height;

    el.addChild(label);

    let bonusIcon: Sprite | null = null;
    let bonusText: BitmapText | null = null;
    const attackIcon = this.deps.textures().attackIconTexture;
    if (spec.bonus > 0 && attackIcon) {
      const icon = new Sprite(attackIcon);
      icon.anchor.set(0.5, 1);
      icon.width = BONUS_ICON_SIZE;
      icon.height = BONUS_ICON_SIZE;
      icon.position.set(label.x + label.width / 2 + BONUS_ICON_GAP + BONUS_ICON_SIZE / 2, label.y);
      icon.zIndex = 1;
      el.addChild(icon);
      bonusIcon = icon;
      bonusText = this.deps.pool.takeText(`+${spec.bonus}`, {
        fontSize: FontSize.VERY_SMALL,
        fill: 0xffcc00,
        fontFamily: FONT_OUTLINED,
      });
      bonusText.anchor.set(0, 1);
      bonusText.position.set(label.x + label.width / 2 + BONUS_ICON_GAP + BONUS_ICON_SIZE + BONUS_TEXT_GAP, label.y);
      bonusText.zIndex = 1;
      el.addChild(bonusText);
    }

    const entry: HpBarEntry = {
      el,
      world: spec.world,
      bg,
      side: spec.side ?? HpBarSide.NEUTRAL,
      ghost,
      green,
      label,
      bonusIcon,
      bonusText,
      starveTag: null,
      star: null,
      // A bar is born at the unit's actual hp, not full: a unit that already
      // shows damage (e.g. 20/40) must not render a 100% bar until something
      // else changes.
      greenW: HP_BAR_INNER_W * (spec.maxHp > 0 ? clamp01(spec.hp / spec.maxHp) : 1),
      ghostW: HP_BAR_INNER_W * (spec.maxHp > 0 ? clamp01(spec.hp / spec.maxHp) : 1),
      greenAnim: null,
      ghostAnim: null,
      lastHp: spec.hp,
      damageFromHp: undefined,
      lastSettleAt: 0,
    };
    return entry;
  }

  private updateHpBarLabel(bar: HpBarEntry, spec: HpBarSpec): void {
    bar.label.text = spec.label;
    // A unit with nothing left to do dims its hp text and attack bonus.
    const textAlpha = spec.dim ? HP_LABEL_DIM_ALPHA : 1;
    bar.label.alpha = textAlpha;
    if (bar.bonusIcon) bar.bonusIcon.alpha = textAlpha;
    if (bar.bonusText) bar.bonusText.alpha = textAlpha;
    const starW = this.updateStar(bar, spec);
    this.labelHeight = bar.label.height;
    this.updateStarveTag(bar, spec, starW);
  }

  /** Keeps the veteran star left of the hp text in sync with the unit. Returns the
   *  width it takes (star + gap), 0 when the unit is not a veteran. */
  private updateStar(bar: HpBarEntry, spec: HpBarSpec): number {
    if (!spec.veteran) {
      if (bar.star) {
        bar.star.parent?.removeChild(bar.star);
        bar.star.destroy();
        bar.star = null;
      }
      return 0;
    }
    if (!bar.star) {
      const star = makeIcon32('star-32', VETERAN_STAR_SIZE);
      star.anchor.set(0, 1);
      star.zIndex = 1;
      bar.el.addChild(star);
      bar.star = star;
    }
    const w = VETERAN_STAR_SIZE + VETERAN_STAR_GAP;
    bar.star.position.set(bar.label.x - bar.label.width / 2 - w, bar.label.y - 1);
    return w;
  }

  /** Keeps the red "S" starvation tag before the hp text in sync with the unit. */
  private updateStarveTag(bar: HpBarEntry, spec: HpBarSpec, starW = 0): void {
    if (!spec.starving) {
      if (bar.starveTag) {
        bar.starveTag.parent?.removeChild(bar.starveTag);
        bar.starveTag.destroy();
        bar.starveTag = null;
      }
      return;
    }
    if (!bar.starveTag) {
      const text = this.deps.pool.takeText('S', { fontSize: FontSize.VERY_SMALL, fill: 0xff4d4d, fontFamily: FONT_OUTLINED });
      text.anchor.set(1, 1);
      text.zIndex = 1;
      bar.el.addChild(text);
      bar.starveTag = text;
    }
    // The tag ends HP_LABEL_PLATE_GAP before the hp text (and the star, if any).
    bar.starveTag.position.set(bar.label.x - bar.label.width / 2 - starW - HP_LABEL_PLATE_GAP, bar.label.y);
  }

  private drawHpBars(bar: HpBarEntry): void {
    const boxTop = HP_BAR_BOX_TOP;
    bar.ghost.clear().rect(-HP_BAR_OUTER_W / 2 + HP_BAR_PADDING, boxTop + HP_BAR_PADDING, bar.ghostW, HP_BAR_HEIGHT).fill(HP_BAR_GHOST);
    bar.green.clear().rect(-HP_BAR_OUTER_W / 2 + HP_BAR_PADDING, boxTop + HP_BAR_PADDING, bar.greenW, HP_BAR_HEIGHT).fill(HP_BAR_FILL[bar.side]);
  }

  /** Runs the shared hp bar ticker while any bar is animating; redraws the
   *  green/ghost widths from their timers each frame. */
  private ensureTick(): void {
    if (this.tickRemove) return;
    const fn = (): void => {
      let any = false;
      const now = performance.now();
      for (const bar of this.bars.values()) {
        if (bar.el.destroyed) {
          bar.greenAnim = null;
          bar.ghostAnim = null;
          continue;
        }
        let dirty = false;
        if (bar.greenAnim) {
          const a = bar.greenAnim;
          const t = Math.min(1, (now - a.start) / HP_BAR_GREEN_MS);
          bar.greenW = a.from + (a.to - a.from) * t;
          if (t >= 1) {
            bar.greenW = a.to;
            bar.greenAnim = null;
          }
          dirty = true;
        }
        if (bar.ghostAnim) {
          const a = bar.ghostAnim;
          const t = Math.min(1, (now - a.start) / HP_BAR_GHOST_MS);
          bar.ghostW = a.from + (a.to - a.from) * t;
          if (t >= 1) {
            bar.ghostW = a.to;
            bar.ghostAnim = null;
            // The damage has fully settled: a later up-swing to the pre-damage
            // hp is a combat re-hydration until the restage window lapses.
            bar.lastSettleAt = now;
          }
          dirty = true;
        }
        if (dirty) this.drawHpBars(bar);
        if (bar.greenAnim || bar.ghostAnim) any = true;
      }
      if (!any) this.stopTick();
    };
    const remover = (): void => {
      this.deps.app.ticker.remove(fn);
    };
    this.deps.app.ticker.add(fn);
    this.tickRemove = remover;
  }

  stopTick(): void {
    if (this.tickRemove) {
      const remover = this.tickRemove;
      this.tickRemove = null;
      remover();
    }
  }

  /** Screen positions for the persistent hp bars (they are not overlay items,
   *  so `applyTransform` asks us to place them alongside the damage badges). */
  syncPositions(pan: { x: number; y: number }, scale: number): void {
    for (const bar of this.bars.values()) {
      if (bar.el.destroyed) continue;
      bar.el.position.set(pan.x + bar.world.x * scale, pan.y + bar.world.y * scale);
    }
  }

  /** @private test accessor: the live hp bar entries (order of creation) plus
   *  each bar's current green/ghost fill widths. */
  entries(): { el: Container; world: { x: number; y: number }; greenW: number; ghostW: number }[] {
    return [...this.bars.values()].map((b) => ({ el: b.el, world: b.world, greenW: b.greenW, ghostW: b.ghostW }));
  }

  clear(): void {
    this.bars.clear();
  }
}
