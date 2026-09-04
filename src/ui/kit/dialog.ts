import { Application, Container, Graphics } from 'pixi.js';
import { THEME } from './theme';

export interface DialogOpts {
  app: Application;
  width: number;
  height: number;
  onClose: () => void;
  closeOnOutside?: boolean;
  alpha?: number;
  bgColor?: number;
}

export class Dialog {
  readonly el: Container;
  readonly card: Container;

  constructor(opts: DialogOpts) {
    const el = new Container();
    const backdrop = new Graphics();
    backdrop
      .rect(0, 0, opts.app.screen.width, opts.app.screen.height)
      .fill({ color: 0x000000, alpha: opts.alpha ?? 0.5 });
    backdrop.eventMode = 'static';
    if (opts.closeOnOutside ?? true) backdrop.on('pointertap', opts.onClose);
    el.addChild(backdrop);

    const bg = new Graphics();
    bg.roundRect(0, 0, opts.width, opts.height, 8).fill(opts.bgColor ?? 0x000000);
    this.card = new Container();
    this.card.addChild(bg);
    this.card.position.set(opts.app.screen.width / 2 - opts.width / 2, opts.app.screen.height / 2 - opts.height / 2);

    el.addChild(this.card);
    this.el = el;
  }

  destroy(): void {
    this.el.destroy({ children: true });
  }
}
