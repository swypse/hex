import { BitmapText, Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';
import { makeLabel } from './label';

export interface TribeOption {
  el: Container;
  setSelected(selected: boolean): void;
  /** The tribe-name label, used for vertical layout of the option column. */
  label: BitmapText;
  /** Total height of the tribe-name block under the circle (one or two lines). */
  labelHeight: number;
}

const RADIUS = 28;
const LINE_GAP = 2;

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
    const label = makeLabel(text, { fontSize: 14, fill: 0xeeeeee });
    label.anchor.set(0.5, 0);
    label.position.set(0, RADIUS + 6 + i * (14 + LINE_GAP));
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
  const top = labels[0]!;
  const labelHeight = labels.length * 14 + (labels.length - 1) * LINE_GAP;
  return { el, setSelected, label: top, labelHeight };
}
