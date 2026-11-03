import { Container, Graphics, type BitmapText } from 'pixi.js';
import { makeLabel } from '../../gfx/label';
import { markDirty } from '../../gfx/render-gate';
import { sfx } from '../../sound/sfx';
import { FontSize } from '@enums';

const TRACK_W = 40;
const TRACK_H = 22;
const KNOB_R = 8;
const KNOB_PAD = 3;
const COLOR_ON = 0x5297ff;
const COLOR_OFF = 0x4b516f;
const KNOB_COLOR = 0xffffff;
const SLIDE_MS = 120;

export interface Switch {
  el: Container;
  isOn(): boolean;
  setChecked(checked: boolean): void;
  tap(): void;
}

export interface SwitchOptions {
  /** Optional label rendered next to the switch; clicking it toggles too. */
  label?: string;
  /** Horizontal gap between the switch and its label. Default 10. */
  labelGap?: number;
}

/** A pill toggle with a sliding knob. */
export function makeSwitch(
  checked: boolean,
  onToggle: (checked: boolean) => void,
  options: SwitchOptions = {},
): Switch {
  const el = new Container();
  const labelGap = options.labelGap ?? 10;
  let on = checked;
  /** Knob position 0 (off) .. 1 (on); eased towards the target when toggled. */
  let pos = on ? 1 : 0;
  let raf: number | null = null;
  const track = new Graphics();

  const paint = (): void => {
    track.clear();
    // Mix the track colour with the knob position so the colour slides too.
    const color = pos >= 0.5 ? COLOR_ON : COLOR_OFF;
    track.roundRect(0, 0, TRACK_W, TRACK_H, TRACK_H / 2).fill(color);
    const x = KNOB_PAD + KNOB_R + pos * (TRACK_W - 2 * (KNOB_PAD + KNOB_R));
    track.circle(x, TRACK_H / 2, KNOB_R).fill(KNOB_COLOR);
  };
  paint();

  const slideTo = (target: number): void => {
    if (raf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    raf = null;
    if (typeof requestAnimationFrame !== 'function') {
      pos = target;
      paint();
      return;
    }
    const from = pos;
    const start = performance.now();
    const step = (now: number): void => {
      const p = Math.min(1, (now - start) / SLIDE_MS);
      pos = from + (target - from) * p;
      paint();
      markDirty();
      raf = p < 1 ? requestAnimationFrame(step) : null;
    };
    raf = requestAnimationFrame(step);
  };

  const tap = (): void => {
    sfx.play('click');
    on = !on;
    slideTo(on ? 1 : 0);
    onToggle(on);
  };

  el.addChild(track);
  el.eventMode = 'static';
  el.cursor = 'pointer';
  el.on('pointertap', tap);

  if (options.label) {
    const label: BitmapText = makeLabel(options.label, { fontSize: FontSize.SMALL, fill: 0xcccccc });
    label.position.set(TRACK_W + labelGap, Math.max(0, (TRACK_H - label.height) / 2));
    label.eventMode = 'static';
    label.cursor = 'pointer';
    // The label sits inside `el`, whose own tap handler would toggle a second time.
    label.on('pointertap', (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      tap();
    });
    el.addChild(label);
  }

  const setChecked = (value: boolean): void => {
    on = value;
    pos = on ? 1 : 0;
    paint();
  };

  return { el, isOn: () => on, setChecked, tap };
}
