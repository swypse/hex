import { Circle, Container, Graphics, Sprite } from 'pixi.js';
import { makeIcon } from './icon';
import { THEME } from './theme';

export interface IconButtonOpts {
  icon: string;
  onClick: () => void;
  size?: number;
  disabled?: boolean;
  color?: number;
  hoverColor?: number;
  pressedColor?: number;
  borderColor?: number;
  borderWidth?: number;
  disabledAlpha?: number;
  transparentDisabled?: boolean;
  onReady?: () => void;
}

export class IconButton extends Container {
  private readonly bg: Graphics;
  private readonly sprite: Sprite;
  private readonly size: number;
  private readonly baseColor: number;
  private readonly hoverColor: number;
  private readonly pressedColor: number;
  private readonly borderColor: number;
  private readonly borderWidth: number;
  private readonly disabledAlpha: number;
  private readonly transparentDisabled: boolean;
  private readonly onClick: () => void;
  private _disabled = false;
  private _hover = false;

  constructor(opts: IconButtonOpts) {
    super();
    this.onClick = opts.onClick;
    this.size = opts.size ?? 36;
    this.baseColor = opts.color ?? THEME.button;
    this.hoverColor = opts.hoverColor ?? THEME.buttonHover;
    this.pressedColor = opts.pressedColor ?? THEME.buttonPressed;
    this.borderColor = opts.borderColor ?? THEME.highlight;
    this.borderWidth = opts.borderWidth ?? 2;
    this.disabledAlpha = opts.disabledAlpha ?? 0.5;
    this.transparentDisabled = opts.transparentDisabled ?? false;
    this.bg = new Graphics();
    this.bg.circle(this.size / 2, this.size / 2, this.size / 2).fill(this.baseColor);
    const iconSize = this.size * 0.6;
    this.sprite = makeIcon(opts.icon, iconSize, () => opts.onReady?.());
    this.sprite.position.set(this.size / 2, this.size / 2);
    this.addChild(this.bg, this.sprite);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    const hitRadius = this.size / 2 + this.borderWidth;
    this.hitArea = new Circle(this.size / 2, this.size / 2, hitRadius);
    this.on('pointerover', this.onOver);
    this.on('pointerout', this.onOut);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.onUp);
    this.on('pointertap', this.onTap);
    this.disabled = opts.disabled ?? false;
  }

  private redraw(fill: number, ring: boolean): void {
    this.bg.clear().circle(this.size / 2, this.size / 2, this.size / 2).fill(fill);
    if (ring) this.bg.stroke({ width: this.borderWidth, color: this.borderColor, alignment: 0 });
  }

  private redrawDisabled(): void {
    if (this.transparentDisabled) {
      this.bg.clear().circle(this.size / 2, this.size / 2, this.size / 2).fill({ color: 0xffffff, alpha: 0 });
    } else {
      this.redraw(this.baseColor, false);
    }
  }

  private onOver = (): void => {
    this._hover = true;
    if (!this._disabled) this.redraw(this.hoverColor, true);
  };
  private onOut = (): void => {
    this._hover = false;
    if (!this._disabled) this.redraw(this.baseColor, false);
  };
  private onDown = (): void => {
    if (!this._disabled) this.redraw(this.pressedColor, true);
  };
  private onUp = (): void => {
    if (this._disabled) {
      this.redrawDisabled();
    } else {
      this.redraw(this._hover ? this.hoverColor : this.baseColor, this._hover);
    }
  };
  private onTap = (): void => {
    if (!this._disabled) this.onClick();
  };

  get disabled(): boolean {
    return this._disabled;
  }
  set disabled(v: boolean) {
    this._disabled = v;
    this.alpha = v ? this.disabledAlpha : 1;
    this.eventMode = v ? 'none' : 'static';
    if (v) this.redrawDisabled();
  }
}
