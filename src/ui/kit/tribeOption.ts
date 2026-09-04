import { Container, Graphics } from 'pixi.js';
import { makeIcon } from './icon';
import { makeLabel } from './label';

export interface TribeOption {
  el: Container;
  setSelected(selected: boolean): void;
}

const RADIUS = 28;
const SELECTION_COLOR = 0x5099ff;

export function makeTribeOption(
  name: string,
  iconFile: string,
  onClick: () => void,
  selected = false,
): TribeOption {
  const el = new Container();
  const circle = new Graphics();
  const clip = new Graphics();
  clip.circle(0, 0, RADIUS).fill(0xffffff);
  const icon = makeIcon(iconFile, 60);
  icon.position.set(0, 0);
  icon.mask = clip;
  const label = makeLabel(name, { fontSize: 12, fill: 0xeeeeee });
  label.anchor.set(0.5, 0);
  label.position.set(0, RADIUS + 6);
  el.addChild(circle, clip, icon, label);
  el.eventMode = 'static';
  el.cursor = 'pointer';
  el.on('pointertap', onClick);
  const setSelected = (s: boolean): void => {
    circle.clear().circle(0, 0, RADIUS).fill(0xffffff);
    if (s) circle.stroke({ width: 4, color: SELECTION_COLOR });
  };
  setSelected(selected);
  return { el, setSelected };
}
