import { type Application, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { makeLabel } from '../../gfx/label';
import { makeSkillIcon, SKILL_ICON_FILES } from '../../gfx/skill-icons';
import { THEME } from '../../gfx/theme';
import { FontSize, SkillId } from '@enums';

const PRICE_FONT_SIZE = FontSize.SMALL;

interface SkillMedallionOpts {
  skill: SkillId;
  opened: boolean;
  /** Text in the top-right badge: the money price, or a checkmark when opened.
   *  Opened medallions omit the badge circle entirely (the orange stroke
   *  already marks them as researched). Omit it to draw no badge at all. */
  priceText?: string;
  /** Full circle diameter in px (default 40). */
  size?: number;
  /** When given, the circle is baked once into a supersampled, mipmapped texture
   *  so it stays smooth at any zoom (live vector strokes shimmer when scaled down). */
  app?: Application;
  /** Glyph bake multiplier for the price text (see `makeLabel`). */
  textBake?: number;
}

const BASE_BAKE_RESOLUTION = 4;
const bakedCircles = new Map<string, Texture>();

function drawCircle(opts: { opened: boolean; size: number }): Graphics {
  const R = opts.size / 2;
  return new Graphics()
    .circle(0, 0, R)
    .fill(opts.opened ? THEME.skillTree.openedSkillBg : THEME.skillTree.closedSkillBg)
    .stroke({
      width: Math.max(2, Math.round(opts.size / 12)),
      color: opts.opened ? THEME.skillTree.openedSkillStroke : THEME.skillTree.closedSkillStroke,
      alpha: 1,
      alignment: 0
    });
}

/** The medallion circle as a sprite using a cached supersampled texture. */
function bakedCircle(app: Application, opened: boolean, size: number): Sprite {
  const key = `${opened}:${size}`;
  let texture = bakedCircles.get(key);
  if (!texture) {
    texture = app.renderer.generateTexture({ target: drawCircle({ opened, size }), resolution: BASE_BAKE_RESOLUTION, antialias: true });
    texture.source.autoGenerateMipmaps = true;
    texture.source.scaleMode = 'linear';
    texture.source.mipmapFilter = 'linear';
    bakedCircles.set(key, texture);
  }
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

/** A skill node medallion: a coloured circle (grey unopened / blue opened)
 * with the skill texture inside and a white-text orange price circle pinned to
 * its top-right edge. The returned container is centred on (0,0). */
export function makeSkillMedallion(opts: SkillMedallionOpts): Container {
  const size = opts.size ?? 40;
  const R = size / 2;
  const el = new Container();

  const bg = opts.app?.renderer?.generateTexture ? bakedCircle(opts.app, opts.opened, size) : drawCircle({ opened: opts.opened, size });
  el.addChild(bg);

  const iconKey = SKILL_ICON_FILES[opts.skill];
  if (iconKey) {
    const icon = makeSkillIcon(iconKey, Math.round(size * 0.72));
    icon.position.set(0, 0);
    el.addChild(icon);
  }

  const badgeX = Math.round(R * 0.78);
  const badgeY = -Math.round(R * 0.78);
  const badgeR = Math.max(6, Math.round(size * 0.21));
  if (!opts.opened && opts.priceText !== undefined) {
    const label = makeLabel(opts.priceText, {
      fontSize: PRICE_FONT_SIZE,
      fill: THEME.white,
      bake: opts.textBake,
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(badgeX, badgeY);

    // Grow the badge when the text (e.g. a 3-digit price) would not fit.
    const r = Math.max(badgeR, Math.ceil(Math.max(label.width, label.height) / 2) + 2);
    const badge = new Graphics();
    badge.circle(badgeX, badgeY, r).fill(THEME.skillTree.closedSkillStroke);
    el.addChild(badge, label);
  }

  return el;
}
