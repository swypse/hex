import { Container, BitmapText } from 'pixi.js';
import { makeLabel } from '../../gfx/label';
import { makePanel } from './panel';
import { FontSize } from '@enums';

interface TextInputOpts {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  onChange: (value: string) => void;
  transform?: (v: string) => string;
  /** `password` masks the shown text and uses a password input. */
  type?: 'text' | 'password';
  /** Screen position of the container's parent. Needed when the field sits
   *  inside a moved container (e.g. a popup), as the HTML input is placed in
   *  screen coordinates. Default: the parent is at the screen origin. */
  origin?: () => { x: number; y: number };
  /** Tab / Shift+Tab pressed while editing; the caller moves focus. */
  onTab?: (backwards: boolean) => void;
}

export class TextInputOverlay {
  private readonly field: Container;
  private readonly label: BitmapText;
  private readonly opts: TextInputOpts;
  private input: HTMLInputElement | null = null;
  private disposed = false;
  private value: string;

  constructor(opts: TextInputOpts) {
    this.opts = opts;
    this.value = opts.value;
    this.field = new Container();
    this.field.position.set(opts.x, opts.y);
    this.field.eventMode = 'static';
    this.field.cursor = 'text';
    this.field.addChild(makePanel(opts.width, opts.height));
    this.label = makeLabel(this.shown(opts.value), { fontSize: FontSize.NORMAL });
    this.field.addChild(this.label);
    this.positionLabel();
    this.field.on('pointertap', () => this.focus());
  }

  get container(): Container {
    return this.field;
  }

  private shown(v: string): string {
    return this.opts.type === 'password' ? '*'.repeat(v.length) : v;
  }

  private positionLabel(): void {
    this.label.position.set(
      (this.opts.width - this.label.width) / 2,
      (this.opts.height - this.label.height) / 2,
    );
  }

  focus(): void {
    if (this.disposed) return;
    this.destroyInput();
    const input = document.createElement('input');
    const origin = this.opts.origin?.() ?? { x: 0, y: 0 };
    if (this.opts.type === 'password') input.type = 'password';
    input.value = this.value;
    input.style.position = 'fixed';
    input.style.left = `${origin.x + this.opts.x}px`;
    input.style.top = `${origin.y + this.opts.y}px`;
    input.style.width = `${this.opts.width}px`;
    input.style.height = `${this.opts.height}px`;
    input.style.fontSize = '16px';
    input.style.fontFamily = 'Roboto, system-ui, sans-serif';
    input.style.color = 'transparent';
    input.style.background = 'transparent';
    input.style.border = 'none';
    input.style.outline = 'none';
    input.style.caretColor = '#eeeeee';
    input.style.textAlign = 'center';
    input.addEventListener('input', () => {
      const v = this.opts.transform ? this.opts.transform(input.value) : input.value;
      this.value = v;
      this.label.text = this.shown(v);
      this.positionLabel();
      this.opts.onChange(v);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.opts.onTab) {
        e.preventDefault();
        e.stopPropagation();
        this.opts.onTab(e.shiftKey);
        return;
      }
      if (e.key === 'Enter') {
        input.blur();
        e.stopPropagation();
      }
    });
    input.addEventListener('blur', () => this.destroyInput());
    document.body.appendChild(input);
    this.input = input;
    input.focus();
  }

  private destroyInput(): void {
    if (this.input) {
      this.input.remove();
      this.input = null;
    }
  }

  destroy(): void {
    this.disposed = true;
    this.destroyInput();
    this.field.destroy({ children: true });
  }
}
