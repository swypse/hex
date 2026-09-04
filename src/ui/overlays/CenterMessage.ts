import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';

const MESSAGE_MS = 1400;
const FONT_SIZE = 20;
const MAX_WIDTH_RATIO = 0.9;
const PADDING_X = 32;

export class CenterMessage {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;
  private current: string | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.unsub = useGameStore.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    if (!this.el || !this.host) return;
    const message = useGameStore.getState().centerMessage;
    if (message === null) return;
    if (message === this.current) return;
    this.current = message;
    this.el.removeChildren().forEach((c) => c.destroy({ children: true }));
    const maxW = Math.max(120, this.host.app.screen.width * MAX_WIDTH_RATIO);
    const text = makeLabel(message, { fontSize: FONT_SIZE, fill: 0xffffff, wordWrap: true, wordWrapWidth: maxW - PADDING_X });
    const w = Math.min(text.width + PADDING_X, maxW);
    const h = text.height + 32;
    const bg = makePanel(w, h, { fill: 0x000000, alpha: 0.85 });
    bg.position.set(-w / 2, -h / 2);
    text.anchor.set(0.5, 0.5);
    this.el.addChild(bg, text);
    this.el.position.set(this.host.app.screen.width / 2, this.host.app.screen.height / 2);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      useGameStore.getState().setCenterMessage(null);
    }, MESSAGE_MS);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.current = null;
  }
}
