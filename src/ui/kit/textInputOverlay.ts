import { Container, Text } from 'pixi.js';
import { makeLabel } from './label';
import { makePanel } from './panel';

export interface TextInputOpts {
  x: number;
  y: number;
  width: number;
  height: number;
  value: string;
  onChange: (value: string) => void;
  transform?: (v: string) => string;
}

export class TextInputOverlay {
  private readonly field: Container;
  private readonly label: Text;
  private readonly opts: TextInputOpts;
  private input: HTMLInputElement | null = null;
  private disposed = false;

  constructor(opts: TextInputOpts) {
    this.opts = opts;
    this.field = new Container();
    this.field.position.set(opts.x, opts.y);
    this.field.eventMode = 'static';
    this.field.cursor = 'text';
    this.field.addChild(makePanel(opts.width, opts.height));
    this.label = makeLabel(opts.value, { fontSize: 16 });
    this.field.addChild(this.label);
    this.positionLabel();
    this.field.on('pointertap', () => this.focus());
  }

  get container(): Container {
    return this.field;
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
    input.value = this.opts.value;
    input.style.position = 'fixed';
    input.style.left = `${this.opts.x}px`;
    input.style.top = `${this.opts.y}px`;
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
      this.label.text = v;
      this.positionLabel();
      this.opts.onChange(v);
    });
    input.addEventListener('keydown', (e) => {
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
