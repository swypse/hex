import { BitmapText, Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeLabel } from '../../gfx/label';
import { TRIBE_STARS_HEIGHT } from './tribe-layout';
import { FontSize } from '@enums';
import { t } from '../../i18n';
import { MAX_STARS } from '../../results/result-validation';

export interface TribeOption {
  el: Container;
  setSelected(selected: boolean): void;
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

export interface TribeOptionExtras {
  /** Star size in px (default 14). */
  starSize?: number;
  /** Tribe-name text size (default `FontSize.SMALL`). */
  nameSize?: FontSize;
  /** Reserve and show a "Games: N" line under the stars. */
  showGames?: boolean;
}
const NAME_TOP = RADIUS + 6;
const NAME_LINE = 14;

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
  const clip = new Graphics();
  clip.circle(0, 0, RADIUS).fill(0xffffff);
  const icon = makeIcon(iconFile, 60);
  icon.position.set(0, 0);
  icon.mask = clip;
  const lines = nameLines(name);
  const labels = lines.map((text, i) => {
    const label = makeLabel(text, { fontSize: nameSize, fill: 0xeeeeee });
    label.anchor.set(0.5, 0);
    label.position.set(0, NAME_TOP + i * (nameLine + LINE_GAP));
    el.addChild(label);
    return label;
  });
  el.addChild(circle, clip, icon);
  el.eventMode = 'static';
  el.cursor = 'pointer';
  el.on('pointertap', onClick);
  // Outer stroke (alignment 0 = outside the path): applying or removing the
  // selection stroke never shifts the circle or covers its icon.
  const setSelected = (s: boolean): void => {
    circle.clear().circle(0, 0, RADIUS).fill(0xffffff);
    if (s) circle.stroke({ width: 4, color, alignment: 0 });
  };
  setSelected(selected);
  const namesHeight = labels.length * nameLine + (labels.length - 1) * LINE_GAP;
  // The star row sits under the last name line; its room is always reserved.
  const starRow = new Container();
  starRow.position.set(0, NAME_TOP + namesHeight + 2 + starSize / 2);
  starRow.eventMode = 'none';
  el.addChild(starRow);
  const setStars = (value: number | null): void => {
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
  return { el, setSelected, setStars, setGames, label: labels[0]!, labelHeight: namesHeight + starsHeight + gamesHeight };
}
