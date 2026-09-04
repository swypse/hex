import { Container, Graphics } from 'pixi.js';
import { makeLabel } from './label';

export interface Checkbox {
  el: Container;
  setChecked(checked: boolean): void;
}

export function makeCheckbox(checked: boolean, onToggle: (checked: boolean) => void): Checkbox {
  const el = new Container();
  const size = 22;
  let on = checked;
  const bg = new Graphics();
  const mark = makeLabel('\u2713', { fontSize: 15, fill: 0xffffff, fontWeight: '700' });
  mark.anchor.set(0.5, 0.5);
  mark.position.set(size / 2, size / 2);

  const paint = (): void => {
    bg.clear();
    bg.roundRect(0, 0, size, size, 4);
    if (on) bg.fill(0x5099ff);
    bg.stroke({ width: 2, color: 0xcccccc });
    mark.visible = on;
  };
  paint();

  el.addChild(bg, mark);
  el.eventMode = 'static';
  el.cursor = 'pointer';
  el.on('pointertap', () => onToggle(!on));

  const setChecked = (value: boolean): void => {
    on = value;
    paint();
  };

  return { el, setChecked };
}
