import { Container, Graphics, Text } from 'pixi.js';
import { makeLabel } from './label';
import { TEXT_BUTTON, THEME } from './theme';
import { sfx } from '../../sound/sfx';

const SHADOW_OFFSET_X = 4;
const SHADOW_OFFSET_Y = 4;

/** Corner radii in order top-left, top-right, bottom-right, bottom-left. */
export type ButtonCorners = readonly [number, number, number, number];

export interface ButtonOpts {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  fontSize?: number;
  width?: number;
  paddingX?: number;
  paddingY?: number;
  /** Draw the drop shadow under the button. Default true. */
  shadow?: boolean;
  /** Per-corner background radius. Default [4, 4, 4, 4]. */
  corners?: ButtonCorners;
}

/** Traces an axis-aligned rectangle with individually rounded corners onto the
 *  current path of a Graphics object. */
function traceRoundedRect(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  corners: ButtonCorners,
): void {
  const maxR = Math.max(0, Math.min(w, h) / 2);
  const c = corners.map((r) => Math.max(0, Math.min(r, maxR))) as [number, number, number, number];
  const [tl, tr, br, bl] = c;
  const arc = (x1: number, y1: number, x2: number, y2: number, r: number): void => {
    if (r > 0) g.arcTo(x1, y1, x2, y2, r);
    else g.lineTo(x1, y1);
  };
  g.moveTo(x + tl, y);
  g.lineTo(x + w - tr, y);
  arc(x + w, y, x + w, y + tr, tr);
  g.lineTo(x + w, y + h - br);
  arc(x + w, y + h, x + w - br, y + h, br);
  g.lineTo(x + bl, y + h);
  arc(x, y + h, x, y + h - bl, bl);
  g.lineTo(x, y + tl);
  arc(x, y, x + tl, y, tl);
  g.closePath();
}

export class Button extends Container {
  private readonly bg: Graphics;
  private readonly text: Text;
  private readonly w: number;
  private readonly h: number;
  private readonly onClick: () => void;
  private readonly shadow: boolean;
  private readonly corners: ButtonCorners;
  private _disabled = false;
  private _selected = false;
  private _hover = false;

  constructor(opts: ButtonOpts) {
    super();
    this.onClick = opts.onClick;
    const paddingX = opts.paddingX ?? TEXT_BUTTON.paddingX;
    const paddingY = opts.paddingY ?? TEXT_BUTTON.paddingY;
    this.text = makeLabel(opts.label.toUpperCase(), { fontSize: opts.fontSize ?? TEXT_BUTTON.fontSize });
    this.w = opts.width ?? this.text.width + paddingX * 2;
    this.h = Math.max(this.text.height + paddingY * 2, TEXT_BUTTON.minHeight);
    this.shadow = opts.shadow ?? true;
    this.corners = opts.corners ?? [THEME.radius, THEME.radius, THEME.radius, THEME.radius];
    this.bg = new Graphics();
    this.render(THEME.button, false);
    this.text.position.set((this.w - this.text.width) / 2, (this.h - this.text.height) / 2);
    this.addChild(this.bg, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);
    this.on('pointertap', this.onTap);
    this.disabled = opts.disabled ?? false;
    this.selected = opts.selected ?? false;
  }

  private render(fill: number, ring: boolean): void {
    this.bg.clear();
    const uniform = this.shadow && this.corners[0] === this.corners[1] && this.corners[1] === this.corners[2] && this.corners[2] === this.corners[3];
    if (uniform) {
      const r = this.corners[0]!;
      this.bg
        .roundRect(SHADOW_OFFSET_X, SHADOW_OFFSET_Y, this.w, this.h, r)
        .fill({ color: 0x000000, alpha: 0.3 });
      this.bg.roundRect(0, 0, this.w, this.h, r).fill(fill);
      if (this._selected) {
        this.bg.roundRect(1.5, 1.5, this.w - 3, this.h - 3, r).stroke({ width: 3, color: THEME.white });
      } else if (ring) {
        this.bg.roundRect(1, 1, this.w - 2, this.h - 2, r).stroke({ width: 2, color: THEME.highlight });
      }
      return;
    }
    if (this.shadow) {
      traceRoundedRect(this.bg, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, this.w, this.h, this.corners);
      this.bg.fill({ color: 0x000000, alpha: 0.3 });
    }
    traceRoundedRect(this.bg, 0, 0, this.w, this.h, this.corners);
    this.bg.fill(fill);
    const inset = (s: number, i: number): number => Math.max(0, this.corners[i]! - s);
    if (this._selected) {
      traceRoundedRect(this.bg, 1.5, 1.5, this.w - 3, this.h - 3, [
        inset(1.5, 0), inset(1.5, 1), inset(1.5, 2), inset(1.5, 3),
      ] as ButtonCorners);
      this.bg.stroke({ width: 3, color: THEME.white });
    } else if (ring) {
      traceRoundedRect(this.bg, 1, 1, this.w - 2, this.h - 2, [
        inset(1, 0), inset(1, 1), inset(1, 2), inset(1, 3),
      ] as ButtonCorners);
      this.bg.stroke({ width: 2, color: THEME.highlight });
    }
  }

  private redraw(): void {
    this.render(THEME.button, this._selected);
  }

  private onOver = (): void => {
    if (this._disabled) return;
    this._hover = true;
    this.render(THEME.buttonHover, true);
  };
  private onOut = (): void => {
    this._hover = false;
    this.render(THEME.button, false);
  };
  private onDown = (): void => {
    if (!this._disabled) this.render(THEME.buttonPressed, true);
  };
  private onUp = (): void => {
    if (this._disabled) {
      this.render(THEME.button, false);
    } else {
      this.render(this._hover ? THEME.buttonHover : THEME.button, this._hover || this._selected);
    }
  };
  private onTap = (): void => {
    if (this._disabled) return;
    sfx.play('click');
    this.onClick();
  };

  trigger(): void {
    if (this._disabled) return;
    sfx.play('click');
    this.onClick();
  }

  setLabel(text: string): void {
    this.text.text = text.toUpperCase();
    this.text.position.set((this.w - this.text.width) / 2, (this.h - this.text.height) / 2);
  }

  get disabled(): boolean {
    return this._disabled;
  }

  set disabled(v: boolean) {
    this._disabled = v;
    this.alpha = v ? 0.5 : 1;
    this.eventMode = v ? 'none' : 'static';
    this.redraw();
  }

  get selected(): boolean {
    return this._selected;
  }

  set selected(v: boolean) {
    this._selected = v;
    this.redraw();
  }
}
