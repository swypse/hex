import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { makeLabel } from '../../gfx/label';
import { Popup, POPUP_BODY_SIZE } from '../kit/popup';
import { easeOutBack, easeOutCubic } from '../../util/easing';
import { PopupPosition } from '@enums';

const SHOW_MS = 1000;
const IN_MS = 420;
const OUT_MS = 300;
const TOP_Y = 40;
/** Distance the card slides in from above / out to above. */
const SLIDE_PX = 70;

/** The transient top-center card ("Your turn", pirates, weather): same card as the center
 *  message, but its own queue. Slides down with an overshoot, holds, slides up. */
export class TurnBanner {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private tickerFn: ((t: { deltaMS: number }) => void) | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.el = new Container();
    root.addChild(this.el);
    this.unsub = useGameStore.subscribe(() => this.next());
    this.next();
  }

  /** Shows the next queued banner once the current one has slid out. */
  private next(): void {
    if (this.busy || !this.el || !this.host) return;
    // Set first: shifting the queue notifies this very subscriber.
    this.busy = true;
    const text = useGameStore.getState().shiftBanner();
    if (text !== null) this.show(text);
    else this.busy = false;
  }

  private show(message: string): void {
    if (!this.el || !this.host) return;
    const popup = new Popup({
      app: this.host.app,
      modal: false,
      interactive: false,
      fitContent: true,
      closeOnBackdrop: false,
      closeOnEscape: false,
      position: PopupPosition.TOP,
      topY: TOP_Y,
    });
    const text = makeLabel(message, { fontSize: POPUP_BODY_SIZE, fill: 0xffffff });
    popup.content.addChild(text);
    this.el.addChild(popup.el);
    this.popup = popup;
    popup.finish();
    this.animate(IN_MS, (p) => this.pose(easeOutBack(p), Math.min(1, p * 2)), () => {
      this.timer = setTimeout(() => this.hide(), SHOW_MS);
    });
  }

  private hide(): void {
    this.timer = null;
    this.animate(OUT_MS, (p) => this.pose(1 - easeOutCubic(p) * 1.3, 1 - p), () => {
      this.clear();
      this.busy = false;
      this.next();
    });
  }

  /** `k` 0 = fully slid off above, 1 = resting; may overshoot past 1. */
  private pose(k: number, alpha: number): void {
    if (!this.popup) return;
    this.popup.el.y = -SLIDE_PX * (1 - k);
    this.popup.el.alpha = alpha;
  }

  private animate(ms: number, step: (p: number) => void, onDone: () => void): void {
    const ticker = this.host?.app.ticker;
    this.stopTicker();
    if (!ticker) {
      step(1);
      onDone();
      return;
    }
    let elapsed = 0;
    step(0);
    const fn = (tk: { deltaMS: number }): void => {
      elapsed += tk.deltaMS;
      const p = Math.min(1, elapsed / ms);
      step(p);
      if (p >= 1) {
        this.stopTicker();
        onDone();
      }
    };
    this.tickerFn = fn;
    ticker.add(fn);
  }

  private stopTicker(): void {
    if (this.tickerFn) this.host?.app.ticker?.remove(this.tickerFn);
    this.tickerFn = null;
  }

  private clear(): void {
    this.stopTicker();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.popup?.destroy();
    this.popup = null;
  }

  destroy(): void {
    this.clear();
    this.busy = false;
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
