import { BitmapText, Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';
import { makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeLabel } from '../../gfx/label';
import { TRIBE_STARS_HEIGHT } from './tribe-layout';
import { FontSize } from '@enums';
import { MAX_STARS } from '../../results/result-validation';

export interface TribeOption {
  el: Container;
  setSelected(selected: boolean): void;
  /** Best result for the tribe: filled/empty stars under the name; null hides them. */
  setStars(stars: number | null): void;
  /** The tribe-name label, used for vertical layout of the option column. */
  label: BitmapText;
  /** Total height of the block under the circle: name lines plus the star row. */
  labelHeight: number;
}

const RADIUS = 28;
const LINE_GAP = 2;
const STAR_SIZE = 14;
const STAR_STEP = STAR_SIZE + 2;
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
): TribeOption {
  const el = new Container();
  const circle = new Graphics();
  const clip = new Graphics();
  clip.circle(0, 0, RADIUS).fill(0xffffff);
  const icon = makeIcon(iconFile, 60);
  icon.position.set(0, 0);
  icon.mask = clip;
  const lines = nameLines(name);
  const labels = lines.map((text, i) => {
    const label = makeLabel(text, { fontSize: FontSize.SMALL, fill: 0xeeeeee });
    label.anchor.set(0.5, 0);
    label.position.set(0, NAME_TOP + i * (NAME_LINE + LINE_GAP));
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
  const namesHeight = labels.length * NAME_LINE + (labels.length - 1) * LINE_GAP;
  // The star row sits under the last name line; its room is always reserved.
  const starRow = new Container();
  starRow.position.set(0, NAME_TOP + namesHeight + 2 + STAR_SIZE / 2);
  starRow.eventMode = 'none';
  el.addChild(starRow);
  const setStars = (value: number | null): void => {
    starRow.removeChildren().forEach((c) => c.destroy());
    if (value === null) return;
    for (let i = 0; i < MAX_STARS; i++) {
      const star = makeActionButtonIcon(i < value ? 'action-star' : 'action-star-empty', STAR_SIZE);
      star.position.set((i - (MAX_STARS - 1) / 2) * STAR_STEP, 0);
      starRow.addChild(star);
    }
  };
  setStars(stars);
  return { el, setSelected, setStars, label: labels[0]!, labelHeight: namesHeight + TRIBE_STARS_HEIGHT };
}
