import { Container, Graphics, BitmapText, Rectangle, type Sprite } from 'pixi.js';
import { makeIcon32 } from '../../gfx/icons32';
import { makeLabel } from '../../gfx/label';
import { TEXT_BUTTON, THEME } from '../../gfx/theme';
import { sfx } from '../../sound/sfx';
import { ButtonStyle, FontSize } from '@enums';
import { clamp } from '../../util/math';

const SHADOW_OFFSET_X = 4;
const SHADOW_OFFSET_Y = 4;
/** Gap between a button's icon and its text. */
const ICON_GAP = 6;
/** MENU style: accent bar width and how far the label slides when active. */
const MENU_BAR_WIDTH = 4;
const MENU_SLIDE = 8;
/** Flat popup / segment styles. */
const FLAT_RADIUS = 6;
const SEGMENT_INSET = 2;
const ACCENT = 0x5297ff;
const ACCENT_HOVER = 0x74adff;
const IDLE_SEGMENT_TINT = 0xb0b8d8;

/** Corner radii in order top-left, top-right, bottom-right, bottom-left. */
export type ButtonCorners = readonly [number, number, number, number];

interface ButtonOpts {
  label: string;
  /** A 32px-atlas icon key (e.g. 'attack-32') drawn before the text, as tall as the text. */
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  selected?: boolean;
  fontSize?: FontSize;
  /** Default SOLID. */
  style?: ButtonStyle;
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
  const c = corners.map((r) => clamp(r, 0, maxR)) as [number, number, number, number];
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
  private readonly text: BitmapText;
  private readonly icon: Sprite | null = null;
  private readonly w: number;
  private readonly h: number;
  private readonly onClick: () => void;
  private readonly shadow: boolean;
  private readonly paddingX: number;
  private style: ButtonStyle;
  /** MENU style: current label nudge. */
  private slide = 0;
  private readonly corners: ButtonCorners;
  private _disabled = false;
  private _selected = false;
  private _hover = false;

  constructor(opts: ButtonOpts) {
    super();
    this.onClick = opts.onClick;
    const paddingX = opts.paddingX ?? TEXT_BUTTON.paddingX;
    this.paddingX = paddingX;
    this.style = opts.style ?? ButtonStyle.SOLID;
    const paddingY = opts.paddingY ?? TEXT_BUTTON.paddingY;
    this.text = makeLabel(opts.label.toUpperCase(), {
      fontSize: opts.fontSize ?? TEXT_BUTTON.fontSize,
      ...(this.style === ButtonStyle.TEXT && { fill: 0xffffff }),
    });
    if (opts.icon) {
      this.icon = makeIcon32(opts.icon, this.text.height);
      this.icon.anchor.set(0, 0.5);
    }
    this.w = opts.width ?? this.contentWidth() + paddingX * 2;
    this.h = Math.max(this.text.height + paddingY * 2, TEXT_BUTTON.minHeight);
    this.shadow = opts.shadow ?? true;
    this.corners = opts.corners ?? [THEME.radius, THEME.radius, THEME.radius, THEME.radius];
    this.bg = new Graphics();
    this.render(THEME.button);
    this.addChild(this.bg, this.text);
    if (this.icon) this.addChild(this.icon);
    this.layoutContent();
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

  private render(fill: number): void {
    this.bg.clear();
    const idle = fill === THEME.button;
    const pressed = fill === THEME.buttonPressed;
    switch (this.style) {
      case ButtonStyle.TEXT:
        this.hitArea = new Rectangle(0, 0, this.w, this.h);
        // Keyboard selection shows as an underline.
        if (this._selected) this.bg.rect(this.text.x, this.text.y + this.text.height, this.text.width, 1).fill(0xffffff);
        return;
      case ButtonStyle.MENU: {
        this.hitArea = new Rectangle(0, 0, this.w, this.h);
        if (!idle) {
          this.bg.rect(0, 0, this.w, this.h).fill({ color: 0xffffff, alpha: pressed ? 0.22 : 0.12 });
          this.bg.rect(0, 0, MENU_BAR_WIDTH, this.h).fill(THEME.highlight);
        }
        this.slide = idle ? 0 : MENU_SLIDE;
        this.layoutContent();
        return;
      }
      case ButtonStyle.POPUP: {
        const color = idle ? ACCENT : pressed ? THEME.buttonPressed : ACCENT_HOVER;
        this.bg.roundRect(0, 0, this.w, this.h, FLAT_RADIUS).fill(color);
        return;
      }
      case ButtonStyle.POPUP_OUTLINE: {
        // Always filled so the whole rect is hittable; transparent when idle.
        const alpha = idle ? 0 : pressed ? 0.18 : 0.1;
        this.bg.roundRect(0, 0, this.w, this.h, FLAT_RADIUS).fill({ color: 0xffffff, alpha });
        this.bg.roundRect(0, 0, this.w, this.h, FLAT_RADIUS).stroke({ color: 0xffffff, alpha: 0.4, width: 1.5, alignment: 1 });
        return;
      }
      case ButtonStyle.SEGMENT: {
        this.hitArea = new Rectangle(0, 0, this.w, this.h);
        const inner = [SEGMENT_INSET, SEGMENT_INSET, this.w - SEGMENT_INSET * 2, this.h - SEGMENT_INSET * 2] as const;
        if (this._selected) {
          this.bg.roundRect(...inner, FLAT_RADIUS - 1).fill(pressed ? THEME.buttonPressed : ACCENT);
        } else if (!idle || this._hover) {
          this.bg.roundRect(...inner, FLAT_RADIUS - 1).fill({ color: 0xffffff, alpha: pressed ? 0.16 : 0.08 });
        }
        this.text.tint = this._selected ? 0xffffff : IDLE_SEGMENT_TINT;
        return;
      }
      default:
        break;
    }
    const uniform = this.shadow && this.corners[0] === this.corners[1] && this.corners[1] === this.corners[2] && this.corners[2] === this.corners[3];
    if (uniform) {
      const r = this.corners[0]!;
      this.bg
        .roundRect(SHADOW_OFFSET_X, SHADOW_OFFSET_Y, this.w, this.h, r)
        .fill({ color: 0x000000, alpha: 0.3 });
      this.bg.roundRect(0, 0, this.w, this.h, r).fill(fill);
      return;
    }
    if (this.shadow) {
      traceRoundedRect(this.bg, SHADOW_OFFSET_X, SHADOW_OFFSET_Y, this.w, this.h, this.corners);
      this.bg.fill({ color: 0x000000, alpha: 0.3 });
    }
    traceRoundedRect(this.bg, 0, 0, this.w, this.h, this.corners);
    this.bg.fill(fill);
  }

  private redraw(): void {
    this.render(this.restingFill());
  }

  /** The resting fill for the current state, ignoring the transient pressed
   *  shade: selected beats hover, which beats the idle color. */
  private restingFill(): number {
    if (this._disabled) return THEME.button;
    if (this._selected) return THEME.buttonSelected;
    if (this._hover) return THEME.buttonHover;
    return THEME.button;
  }

  private onOver = (): void => {
    if (this._disabled) return;
    this._hover = true;
    this.render(this.restingFill());
  };
  private onOut = (): void => {
    this._hover = false;
    this.render(this.restingFill());
  };
  private onDown = (): void => {
    if (!this._disabled) this.render(THEME.buttonPressed);
  };
  private onUp = (): void => {
    if (this._disabled) {
      this.render(THEME.button);
    } else {
      this.render(this.restingFill());
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
    this.layoutContent();
  }

  /** Width of the icon (if any), its gap and the text. */
  private contentWidth(): number {
    return (this.icon ? this.icon.width + ICON_GAP : 0) + this.text.width;
  }

  /** Centres the icon + text group in the button. */
  private layoutContent(): void {
    const x = this.style === ButtonStyle.MENU ? this.paddingX + this.slide : (this.w - this.contentWidth()) / 2;
    const iconW = this.icon ? this.icon.width + ICON_GAP : 0;
    if (this.icon) this.icon.position.set(x, this.h / 2);
    this.text.position.set(x + iconW, (this.h - this.text.height) / 2);
  }

  /** Layout box height; `height` is the drawn bounds, which for transparent styles is just the text. */
  get boxHeight(): number {
    return this.h;
  }

  /** Layout box width (see `boxHeight`). */
  get boxWidth(): number {
    return this.w;
  }

  /** Adopts a style only if the button still has the default one, so callers that
   *  picked a style explicitly are left alone. */
  adoptStyle(style: ButtonStyle): void {
    if (this.style !== ButtonStyle.SOLID) return;
    this.style = style;
    this.redraw();
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
