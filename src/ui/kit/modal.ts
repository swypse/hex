import { Application, Container, Graphics, Text } from 'pixi.js';
import { Button } from './button';
import { makeLabel } from './label';
import { THEME } from './theme';

export interface ModalOpts {
  app: Application;
  title: string;
  lines: string[];
  onClose: () => void;
  closeOnEnter?: boolean;
}

export class Modal {
  private el: Container | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(opts: ModalOpts) {
    const cardW = 440;
    const gap = 14;
    const el = new Container();

    const backdrop = new Graphics();
    backdrop.rect(0, 0, opts.app.screen.width, opts.app.screen.height).fill({ color: 0x000000, alpha: 0.6 });
    backdrop.eventMode = 'static';
    backdrop.on('pointertap', opts.onClose);
    el.addChild(backdrop);

    const title = makeLabel(opts.title, { fontSize: 24, fill: 0xffffff, fontWeight: '700' });

    const content: Text[] = opts.lines.map((line) => new Text({
      text: line,
      style: {
        fontFamily: THEME.fontFamily,
        fontSize: 15,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cardW - 48,
      },
      resolution: Math.max(2, window.devicePixelRatio || 2),
    }));

    const close = new Button({ label: 'Close', width: 140, onClick: opts.onClose });

    let y = 24 + 40 + gap;
    for (const t of content) {
      t.position.set(24, y);
      y += t.height + gap;
    }
    const cardH = y + 34 + 16;

    const card = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, cardW, cardH, 8).fill(0x111111);
    card.addChild(bg);

    title.position.set(cardW / 2 - title.width / 2, 24);
    card.addChild(title);
    for (const t of content) card.addChild(t);

    close.position.set(cardW / 2 - 70, y);
    card.addChild(close);

    card.position.set(opts.app.screen.width / 2 - cardW / 2, opts.app.screen.height / 2 - cardH / 2);
    el.addChild(card);

    this.el = el;
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || (opts.closeOnEnter && e.key === 'Enter')) {
        e.preventDefault();
        opts.onClose();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  mount(container: Container): void {
    if (this.el) container.addChild(this.el);
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
  }
}
