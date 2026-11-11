import { BitmapText, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { makeIcon } from './icon';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeLabel } from '../../gfx/label';
import { TRIBE_STARS_HEIGHT } from './tribe-layout';
import { FontSize } from '@enums';
import { t } from '../../i18n';
import { markDirty } from '../../gfx/render-gate';
import { RUBBER_BOUNCE_MS, rubberPose } from '../../gfx/rubber-bounce';
import { MAX_STARS } from '../../results/result-validation';

export interface TribeOption {
  el: Container;
  setSelected(selected: boolean): void;
  /** Rubber-ball hop of the icon: squash, jump, land, squash, settle. */
  bounce(): void;
  /** Best result for the tribe: filled/empty stars under the name; null hides them. */
  setStars(stars: number | null): void;
  /** Games count under the stars (needs `games` in the options); null hides it. */
  setGames(games: number | null): void;
  /** The tribe-name label, used for vertical layout of the option column. */
  label: BitmapText;
  /** Total height of the block under the circle: name lines plus the star row. */
  labelHeight: number;
}

const RADIUS = 28;
const LINE_GAP = 2;
const STAR_SIZE = 14;
const GAMES_GAP = 4;
const GAMES_HEIGHT = 16;
/** Name alpha of unselected options when `plainSelection` is on. */
const DIM_NAME_ALPHA = 0.5;

export interface TribeOptionExtras {
  /** Star size in px (default 14). */
  starSize?: number;
  /** Tribe-name text size (default `FontSize.SMALL`). */
  nameSize?: FontSize;
  /** Reserve and show a "Games: N" line under the stars. */
  showGames?: boolean;
  /** The selected name is full white, the others dimmed. */
  plainSelection?: boolean;
}
const NAME_TOP = RADIUS + 6;

const RAY_COUNT = 12;
const RAY_LENGTH = 20;
/** Rotation speed (rad/ms) of the ray sprite. */
const RAY_SPEED = 0.0003;
const GLOW_SCALE = 4;
const GLOW_RGB = '255, 215, 90';
let glowTextures: { halo: Texture; rays: Texture } | null = null;

/** Soft glow bake: a radial halo and blurred rays fading out with distance. */
function bakeGlow(): { halo: Texture; rays: Texture } {
  const half = (RADIUS + RAY_LENGTH) * GLOW_SCALE;
  const make = (draw: (ctx: CanvasRenderingContext2D) => void): Texture => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = half * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(half, half);
    draw(ctx);
    return Texture.from(canvas);
  };
  const inner = (RADIUS - 4) * GLOW_SCALE;
  const fade = (alpha: number): CanvasGradient => {
    const grad = document.createElement('canvas').getContext('2d')!.createRadialGradient(0, 0, inner, 0, 0, half);
    grad.addColorStop(0, `rgba(${GLOW_RGB}, ${alpha})`);
    grad.addColorStop(1, `rgba(${GLOW_RGB}, 0)`);
    return grad;
  };
  const halo = make((ctx) => {
    ctx.fillStyle = fade(0.25);
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.fill();
  });
  const rays = make((ctx) => {
    ctx.filter = `blur(${2 * GLOW_SCALE}px)`;
    ctx.fillStyle = fade(0.3);
    for (let i = 0; i < RAY_COUNT; i++) {
      const a = (i / RAY_COUNT) * Math.PI * 2;
      const w = 0.12;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - w) * inner, Math.sin(a - w) * inner);
      ctx.lineTo(Math.cos(a) * half * 0.95, Math.sin(a) * half * 0.95);
      ctx.lineTo(Math.cos(a + w) * inner, Math.sin(a + w) * inner);
      ctx.closePath();
      ctx.fill();
    }
  });
  return { halo, rays };
}

/** Golden radiance behind the circle: soft static halo plus slowly rotating, pulsing blurred rays. */
function makeRays(): Container {
  const root = new Container();
  root.eventMode = 'none';
  try {
    glowTextures ??= bakeGlow();
  } catch {
    return root; // No canvas 2D (headless): no glow.
  }
  const size = (RADIUS + RAY_LENGTH) * 2;
  const halo = new Sprite(glowTextures.halo);
  const rays = new Sprite(glowTextures.rays);
  for (const sprite of [halo, rays]) {
    sprite.anchor.set(0.5);
    sprite.width = sprite.height = size;
    sprite.blendMode = 'add';
  }
  root.addChild(halo, rays);
  root.onRender = () => {
    const now = performance.now();
    rays.rotation = now * RAY_SPEED;
    rays.alpha = 0.65 + 0.35 * Math.sin(now * 0.003);
    halo.alpha = 0.8 + 0.2 * Math.sin(now * 0.003 + Math.PI);
  };
  return root;
}
const NAME_LINE = 14;

/** Peak lift (px) of the icon hop. */
const BOUNCE_LIFT = 22;

/** Supersampling of the baked mask circle. */
const MASK_SCALE = 4;
let circleMask: Texture | null = null;

/** Anti-aliased circle alpha mask. A Graphics mask is stencil-clipped (hard,
 *  jagged edge, esp. with antialias off on phones); a sprite mask is smooth. */
function circleMaskSprite(): Sprite | Graphics {
  try {
    circleMask ??= bakeCircleMask();
  } catch {
    // No canvas 2D (headless): fall back to a hard-edged stencil mask.
    return new Graphics().circle(0, 0, RADIUS).fill(0xffffff);
  }
  const sprite = new Sprite(circleMask);
  sprite.anchor.set(0.5);
  sprite.width = sprite.height = RADIUS * 2;
  return sprite;
}

function bakeCircleMask(): Texture {
  const size = RADIUS * 2 * MASK_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  return Texture.from(canvas);
}

/** Two-worded tribe names ("Sand people", "Aqua people", ...) wrap onto two
 *  stacked lines under the circle; single-word names stay on one line. */
function nameLines(name: string): string[] {
  const words = name.split(/\s+/).filter((w) => w.length > 0);
  if (words.length >= 2) return words;
  return [name];
}

export function makeTribeOption(
  name: string,
  iconFile: string,
  onClick: () => void,
  selected = false,
  color = 0x5099ff,
  stars: number | null = null,
  extras: TribeOptionExtras = {},
): TribeOption {
  const starSize = extras.starSize ?? STAR_SIZE;
  const starStep = starSize + 2;
  const nameSize = extras.nameSize ?? FontSize.SMALL;
  const nameLine = Math.max(NAME_LINE, nameSize);
  const el = new Container();
  const circle = new Graphics();
  const clip = circleMaskSprite();
  const icon = makeIcon(iconFile, 60);
  icon.position.set(0, 0);
  icon.mask = clip;
  const lines = nameLines(name);
  const labels = lines.map((text, i) => {
    const label = makeLabel(text, { fontSize: nameSize, fill: 0xffffff });
    label.anchor.set(0.5, 0);
    label.position.set(0, NAME_TOP + i * (nameLine + LINE_GAP));
    el.addChild(label);
    return label;
  });
  el.addChild(circle, clip, icon);
  // These hop and squash about the circle's bottom edge; the name and stars stay put.
  const body = [circle, clip, icon];
  el.eventMode = 'static';
  el.cursor = 'pointer';
  el.on('pointertap', onClick);
  // Outer stroke (alignment 0 = outside the path): applying or removing the
  // selection stroke never shifts the circle or covers its icon.
  const setSelected = (s: boolean): void => {
    circle.clear().circle(0, 0, RADIUS).fill(0xffffff);
    if (s) circle.stroke({ width: 4, color, alignment: 0 });
    if (extras.plainSelection) for (const label of labels) label.alpha = s ? 1 : DIM_NAME_ALPHA;
  };
  setSelected(selected);
  let raf: number | null = null;
  // Rest scales are read when a hop starts from rest (an icon's scale settles once its texture loads);
  // a hop restarted mid-air keeps them rather than treating a squashed scale as the rest scale.
  let base = body.map((part) => ({ x: part.scale.x, y: part.scale.y }));
  const bounce = (): void => {
    if (typeof requestAnimationFrame !== 'function') return;
    if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    if (raf === null) base = body.map((part) => ({ x: part.scale.x, y: part.scale.y }));
    const start = performance.now();
    const step = (now: number): void => {
      if (circle.destroyed) return;
      const p = Math.min(1, (now - start) / RUBBER_BOUNCE_MS);
      const pose = rubberPose(p);
      body.forEach((part, i) => {
        part.position.set(0, RADIUS * (1 - pose.sy) - pose.lift * BOUNCE_LIFT);
        part.scale.set(base[i]!.x * pose.sx, base[i]!.y * pose.sy);
      });
      markDirty();
      raf = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf = requestAnimationFrame(step);
  };
  const namesHeight = labels.length * nameLine + (labels.length - 1) * LINE_GAP;
  // The star row sits under the last name line; its room is always reserved.
  const starRow = new Container();
  starRow.position.set(0, NAME_TOP + namesHeight + 2 + starSize / 2);
  starRow.eventMode = 'none';
  el.addChild(starRow);
  let rays: Container | null = null;
  const setStars = (value: number | null): void => {
    const gold = value !== null && value >= MAX_STARS;
    if (gold && !rays) {
      rays = makeRays();
      el.addChildAt(rays, 0);
    } else if (!gold && rays) {
      rays.destroy({ children: true });
      rays = null;
    }
    starRow.removeChildren().forEach((c) => c.destroy());
    if (value === null) return;
    for (let i = 0; i < MAX_STARS; i++) {
      const star = makeActionButtonIcon(i < value ? 'action-star' : 'action-star-empty', starSize);
      star.position.set((i - (MAX_STARS - 1) / 2) * starStep, 0);
      starRow.addChild(star);
    }
  };
  setStars(stars);
  const starsHeight = extras.starSize ? starSize + 4 : TRIBE_STARS_HEIGHT;
  let gamesLabel: BitmapText | null = null;
  if (extras.showGames) {
    gamesLabel = makeLabel('', { fontSize: FontSize.VERY_SMALL, fill: 0xcccccc });
    gamesLabel.anchor.set(0.5, 0);
    gamesLabel.position.set(0, NAME_TOP + namesHeight + 2 + starsHeight + GAMES_GAP);
    gamesLabel.eventMode = 'none';
    el.addChild(gamesLabel);
  }
  const setGames = (value: number | null): void => {
    if (!gamesLabel) return;
    gamesLabel.visible = value !== null;
    if (value !== null) gamesLabel.text = t('common.games', { n: value });
  };
  setGames(null);
  const gamesHeight = extras.showGames ? GAMES_GAP + GAMES_HEIGHT : 0;
  return { el, setSelected, bounce, setStars, setGames, label: labels[0]!, labelHeight: namesHeight + starsHeight + gamesHeight };
}
