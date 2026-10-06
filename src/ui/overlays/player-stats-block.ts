import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { placeWord } from '../../i18n/lists';
import { tribeById } from '../../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { gameOverRows, totalScore } from '../../game/score';
import { achievementNameKey, achievementTotalScore, unlockedAchievements } from '../../game/achievements';
import type { GameMap } from '../../game/map/map-gen';
import type { Player } from '../../game/players';
import { makeIconChip } from '../kit/tribe-chip';
import { makeLabel } from '../../gfx/label';
import { FontSize } from '@enums';

export function placeColor(place: number): number {
  if (place === 1) return 0xffd700;
  if (place === 2) return 0xc0c0c0;
  if (place === 3) return 0xcd7f32;
  return 0x888888;
}

const CHIP_SIZE = 32;
const HEADER_LINE = 40;
const ROW_LINE = 18;
const ROW_GAP = 6;
const BLOCK_GAP = 14;

export interface PlayerBlockOptions {
  player: Player;
  /** 1-based place in the ranking. */
  place: number;
  map: GameMap;
  /** Tribes the local player knows; others show as "Unknown tribe". */
  known: Set<number>;
  /** Extra quick-capture score shown as its own row (game over only). */
  fastBonus?: number;
  /** Draws the name in grey (eliminated players in the live stats popup). */
  dimmed?: boolean;
}

/** Draws one player's stats block (header with tribe chip, name, score and
 *  place; score breakdown rows; achievements) into `content` starting at `y`,
 *  with a divider above it unless it is the first block. Returns the y below. */
export function drawPlayerStatsBlock(content: Container, cw: number, y: number, first: boolean, o: PlayerBlockOptions): number {
  const { player: p, place, map } = o;
  const pTribe = tribeById(p.tribe);
  const knownTribe = pTribe !== undefined && o.known.has(p.tribe);
  const tribeColor = knownTribe ? pTribe!.color : UNKNOWN_TRIBE_COLOR;
  const tribeName = knownTribe ? pTribe!.name : t('ui.unknownTribe');

  if (!first) {
    const sep = new Graphics();
    sep.rect(0, y, cw, 1).fill({ color: 0xffffff, alpha: 0.12 });
    content.addChild(sep);
    y += BLOCK_GAP;
  }
  const headerCentre = y + HEADER_LINE / 2;

  if (knownTribe) {
    const chip = makeIconChip(`${pTribe!.code}-icon.png`, CHIP_SIZE, { bgColor: 0xffffff });
    chip.position.set(CHIP_SIZE / 2, headerCentre);
    content.addChild(chip);
  } else {
    const unknown = new Container();
    const bg = new Graphics();
    bg.circle(0, 0, CHIP_SIZE / 2).fill(UNKNOWN_TRIBE_COLOR);
    const q = makeLabel('?', { fontSize: FontSize.BIG, fill: 0xffffff, fontWeight: '800' });
    q.anchor.set(0.5, 0.5);
    unknown.addChild(bg, q);
    unknown.position.set(CHIP_SIZE / 2, headerCentre);
    content.addChild(unknown);
  }

  const name = makeLabel(tribeName, { fontSize: FontSize.SMALL, fill: o.dimmed ? 0x777777 : tribeColor, fontWeight: '700' });
  name.anchor.set(0, 0.5);
  name.position.set(CHIP_SIZE + 8, headerCentre);
  content.addChild(name);

  const score = totalScore(map, p);
  const scoreLabel = makeLabel(t('stats.pts', { score }), { fontSize: FontSize.BIG, fill: 0xff8c00, fontWeight: '900' });
  scoreLabel.anchor.set(1, 0.5);
  scoreLabel.position.set(cw, headerCentre);
  content.addChild(scoreLabel);
  const placeLabel = makeLabel(placeWord(place), { fontSize: FontSize.VERY_SMALL, fill: placeColor(place), fontWeight: '600' });
  placeLabel.anchor.set(1, 0.5);
  placeLabel.position.set(cw - scoreLabel.width - 8, headerCentre);
  content.addChild(placeLabel);

  y += HEADER_LINE;

  const rows = gameOverRows(map, p, o.fastBonus ?? 0).filter((row) => row.count !== 0 || row.score !== 0);
  for (const row of rows) {
    const centre = y + ROW_LINE / 2;
    const title = makeLabel(row.label, { fontSize: FontSize.VERY_SMALL, fill: 0xaaaaaa });
    title.anchor.set(0, 0.5);
    title.position.set(0, centre);
    content.addChild(title);
    const valueText =
      row.count === 0 ? `+${row.score}` : row.score > 0 ? `${row.count} · +${row.score}` : String(row.count);
    const value = makeLabel(valueText, { fontSize: FontSize.VERY_SMALL, fill: 0xff8c00, fontWeight: '600' });
    value.anchor.set(1, 0.5);
    value.position.set(cw, centre);
    content.addChild(value);
    y += ROW_LINE + ROW_GAP;
  }

  const achievementIds = unlockedAchievements(p);
  if (achievementIds.length > 0) {
    const achTitle = makeLabel(t('stats.detailAchievements'), { fontSize: FontSize.VERY_SMALL, fill: 0xaaaaaa });
    achTitle.anchor.set(0, 0);
    achTitle.position.set(0, y);
    content.addChild(achTitle);
    const achPts = makeLabel(`+${achievementTotalScore(p)}`, { fontSize: FontSize.VERY_SMALL, fill: 0xff8c00, fontWeight: '600' });
    achPts.anchor.set(1, 0);
    achPts.position.set(cw, y);
    content.addChild(achPts);
    y += ROW_LINE + ROW_GAP;
    for (const id of achievementIds) {
      const line = makeLabel(t(achievementNameKey(id)), { fontSize: FontSize.VERY_SMALL, fill: 0xeeeeee });
      line.anchor.set(1, 0);
      line.position.set(cw, y);
      content.addChild(line);
      y += ROW_LINE + ROW_GAP;
    }
  }
  return y;
}
