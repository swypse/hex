import { Container, Graphics, Text } from 'pixi.js';
import { makeLabel } from './label';
import { TEXT_BUTTON, THEME } from './theme';

export interface ButtonOpts {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  fontSize?: number;
  width?: number;
  paddingX?: number;
  paddingY?: number;
}

export class Button extends Container {
  private readonly bg: Graphics;
  private readonly text: Text;
  private readonly w: number;
  private readonly h: number;
  private readonly onClick: () => void;
  private _disabled = false;
  private _selected = false;
  private _hover = false;

  constructor(opts: ButtonOpts) {
    super();
    this.onClick = opts.onClick;
    const paddingX = opts.paddingX ?? TEXT_BUTTON.paddingX;
    const paddingY = opts.paddingY ?? TEXT_BUTTON.paddingY;
    this.text = makeLabel(opts.label, { fontSize: opts.fontSize ?? TEXT_BUTTON.fontSize });
    this.w = opts.width ?? this.text.width + paddingX * 2;
    this.h = Math.max(this.text.height + paddingY * 2, TEXT_BUTTON.minHeight);
    this.bg = new Graphics();
    this.bg.roundRect(0, 0, this.w, this.h, THEME.radius).fill(THEME.button);
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
    this.bg.clear().roundRect(0, 0, this.w, this.h, THEME.radius).fill(fill);
    if (this._selected) {
      this.bg.roundRect(1.5, 1.5, this.w - 3, this.h - 3, THEME.radius).stroke({ width: 3, color: THEME.white });
    } else if (ring) {
      this.bg.roundRect(1, 1, this.w - 2, this.h - 2, THEME.radius).stroke({ width: 2, color: THEME.highlight });
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
    if (!this._disabled) this.onClick();
  };

  trigger(): void {
    if (!this._disabled) this.onClick();
  }

  setLabel(text: string): void {
    this.text.text = text;
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
