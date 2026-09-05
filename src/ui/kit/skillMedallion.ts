import { Container, Graphics } from 'pixi.js';
import type { SkillId } from '../../game/skills';
import { makeIcon } from './icon';
import { makeLabel } from './label';

/** Skill icon texture files, shared by the skill tree and the info-panel
 * helper buttons so both always look the same. */
export const SKILL_ICON_FILES: Partial<Record<SkillId, string>> = {
  climbing: 'mountain.png',
  smithery: 'build-mine.png',
  swordsman: 'sword.png',
  geology: 'ore-increase.png',
  water: 'build-port.png',
  waterTemples: 'water-temple.png',
  navigation: 'ship.png',
  forestry: 'build-sawmill.png',
  forestTemple: 'forest-temple.png',
  science: 'miss-decrease.png',
  roads: 'build-road.png',
  shields: 'shield.png',
  defense: 'shield.png',
  catapult: 'catapult.png',
  riding: 'horse.png',
  bridges: 'build-bridge.png',
  knights: 'knight.png',
};

export interface SkillMedallionOpts {
  skill: SkillId;
  opened: boolean;
  /** Text in the top-right badge: the money price, or a checkmark when opened. */
  priceText: string;
  /** Full circle diameter in px (default 40). */
  size?: number;
}

/** A skill node medallion: a coloured circle (grey unopened / blue opened)
 * with the skill texture inside and a white-text orange price circle pinned to
 * its top-right edge. The returned container is centred on (0,0). */
export function makeSkillMedallion(opts: SkillMedallionOpts): Container {
  const size = opts.size ?? 40;
  const R = size / 2;
  const el = new Container();

  const bg = new Graphics();
  bg.circle(0, 0, R)
    .fill(opts.opened ? 0x5198ff : 0x535353)
    .stroke({ width: Math.max(2, Math.round(size / 12)), color: opts.opened ? 0x5198ff : 0x333333 });
  el.addChild(bg);

  const iconFile = SKILL_ICON_FILES[opts.skill];
  if (iconFile) {
    const icon = makeIcon(iconFile, Math.round(size * 0.72));
    icon.position.set(0, 0);
    el.addChild(icon);
  }

  const badgeX = Math.round(R * 0.78);
  const badgeY = -Math.round(R * 0.78);
  const badgeR = Math.max(6, Math.round(size * 0.21));
  const badge = new Graphics();
  badge.circle(badgeX, badgeY, badgeR).fill(0xff8c00).stroke({ width: 1, color: 0xffffff });
  el.addChild(badge);

  const label = makeLabel(opts.priceText, {
    fontSize: Math.max(8, Math.round(size * 0.26)),
    fill: 0xffffff,
    fontWeight: '800',
  });
  label.anchor.set(0.5, 0.5);
  label.position.set(badgeX, badgeY);
  el.addChild(label);

  return el;
}
