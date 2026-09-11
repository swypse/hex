import { Container, Graphics } from 'pixi.js';
import type { SkillId } from '../../game/skills';
import { makeLabel } from './label';
import { makeSkillIcon, SKILL_ICON_FILES } from './skillIcons';
import { THEME } from './theme';

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
    .fill(opts.opened ? THEME.skillTree.openedSkillBg : THEME.skillTree.closedSkillBg)
    .stroke({
      width: Math.max(2, Math.round(size / 12)),
      color: opts.opened ? THEME.skillTree.openedSkillStroke : THEME.skillTree.closedSkillStroke,
      alpha: 1,
      alignment: 0
    });
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
  const badge = new Graphics();
  badge.circle(badgeX, badgeY, badgeR).fill(opts.opened ? THEME.skillTree.openedSkillStroke : THEME.skillTree.closedSkillStroke);
  el.addChild(badge);

  const label = makeLabel(opts.priceText, {
    fontSize: Math.max(8, Math.round(size * 0.26)),
    fill: THEME.white,
    fontWeight: '800',
  });
  label.anchor.set(0.5, 0.5);
  label.position.set(badgeX, badgeY);
  el.addChild(label);

  return el;
}
