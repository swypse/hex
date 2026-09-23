import { Container, Graphics } from 'pixi.js';
import { makeLabel } from './label';
import { sfx } from '../../sound/sfx';

export interface Checkbox {
  el: Container;
  setChecked(checked: boolean): void;
  tap(): void;
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
    // Always fill the box so the whole rect is clickable even when unchecked
    // (a stroke-only shape has no hit area inside); transparent when off.
    if (on) bg.fill(0x5099ff);
    else bg.fill({ color: 0x5099ff, alpha: 0 });
    // Stroke inside the box so it is never clipped by any parent container.
    bg.stroke({ width: 2, color: 0xcccccc, alignment: 1 });
    mark.visible = on;
  };
  paint();

  el.addChild(bg, mark);
  el.eventMode = 'static';
  el.cursor = 'pointer';

  const tap = (): void => {
    sfx.play('click');
    // Flip the visual first so the checkbox reflects the click even before any
    // onToggle-driven rebuild.
    on = !on;
    paint();
    onToggle(on);
  };
  el.on('pointertap', tap);

  const setChecked = (value: boolean): void => {
    on = value;
    paint();
  };

  return { el, setChecked, tap };
}
