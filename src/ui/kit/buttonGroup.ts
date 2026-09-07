import { Container } from 'pixi.js';
import { Button, type ButtonCorners } from './button';
import { THEME } from './theme';

export interface ButtonGroupItem {
  label: string;
  onClick: () => void;
}

export interface ButtonGroupOpts {
  items: ButtonGroupItem[];
  fontSize?: number;
  /** Fixed widths per item; when omitted each button sizes to its label. */
  widths?: number[];
}

/** A flush row of buttons acting as a single control: no gaps and no drop
 *  shadows, with the group's outer corners rounded only on the first and last
 *  buttons (inner corners are square). */
export class ButtonGroup extends Container {
  readonly buttons: Button[] = [];
  /** Uniform row height of the buttons (measured unselected, so selection
   *  highlights never change the reserved space). */
  readonly buttonHeight: number;
  private groupW = 0;
  private groupH = 0;

  constructor(opts: ButtonGroupOpts) {
    super();
    const n = opts.items.length;
    const r = THEME.radius;
    let x = 0;
    let h = 0;
    opts.items.forEach((item, i) => {
      const first = i === 0;
      const last = i === n - 1;
      const corners: ButtonCorners =
        n === 1
          ? [r, r, r, r]
          : first
            ? [r, 0, 0, r]
            : last
              ? [0, r, r, 0]
              : [0, 0, 0, 0];
      const b = new Button({
        label: item.label,
        fontSize: opts.fontSize,
        width: opts.widths?.[i],
        shadow: false,
        corners,
        onClick: item.onClick,
      });
      b.position.set(x, 0);
      this.addChild(b);
      this.buttons.push(b);
      x += b.width;
      h = Math.max(h, b.height);
    });
    this.groupW = x;
    this.groupH = h;
    this.buttonHeight = h;
  }

  /** Total width of the flush row (buttons are positioned on the group origin). */
  get groupWidth(): number {
    return this.groupW;
  }

  get groupHeight(): number {
    return this.groupH;
  }
}
