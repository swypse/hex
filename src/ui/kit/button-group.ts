import { Container, Graphics } from 'pixi.js';
import { Button } from './button';
import { THEME } from '../../gfx/theme';
import { ButtonStyle, FontSize } from '@enums';

interface ButtonGroupItem {
  label: string;
  onClick: () => void;
}

/** Uniform font size for every button in the group. */
const GROUP_FONT_SIZE = FontSize.SMALL;

interface ButtonGroupOpts {
  items: ButtonGroupItem[];
  /** Fixed widths per item; when omitted each button sizes to its label. */
  widths?: number[];
}

const TRACK_COLOR = 0x14172a;
const TRACK_ALPHA = 0.85;
const TRACK_RADIUS = THEME.radius + 4;

/** A segmented control: a dark rounded track with flush segments; the selected
 *  segment is a raised accent pill. */
export class ButtonGroup extends Container {
  readonly buttons: Button[] = [];
  /** Uniform row height of the buttons (measured unselected, so selection
   *  highlights never change the reserved space). */
  readonly buttonHeight: number;
  private groupW = 0;
  private groupH = 0;

  constructor(opts: ButtonGroupOpts) {
    super();
    const track = new Graphics();
    this.addChild(track);
    let x = 0;
    let h = 0;
    for (const [i, item] of opts.items.entries()) {
      const b = new Button({
        label: item.label,
        style: ButtonStyle.SEGMENT,
        fontSize: GROUP_FONT_SIZE,
        width: opts.widths?.[i],
        onClick: item.onClick,
      });
      b.position.set(x, 0);
      this.addChild(b);
      this.buttons.push(b);
      x += b.boxWidth;
      h = Math.max(h, b.boxHeight);
    }
    this.groupW = x;
    this.groupH = h;
    this.buttonHeight = h;
    track.roundRect(0, 0, x, h, TRACK_RADIUS).fill({ color: TRACK_COLOR, alpha: TRACK_ALPHA });
  }

  /** Total width of the flush row (buttons are positioned on the group origin). */
  get groupWidth(): number {
    return this.groupW;
  }

  get groupHeight(): number {
    return this.groupH;
  }
}
