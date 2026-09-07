import { Application, Container, Graphics, Text, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { Button } from './button';
import { makeLabel } from './label';

const PAD_H = 20;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;
const TITLE_GAP = 10;
const FOOTER_GAP = 18;
const BUTTON_GAP = 12;
const CARD_RADIUS = 10;
const BACKDROP_COLOR = 0x000000;
const BACKDROP_ALPHA = 0.6;
const CARD_COLOR = 0x222222;
const SHADOW_OFFSET_X = 10;
const SHADOW_OFFSET_Y = 10;
const SHADOW_ALPHA = 0.5;
const ANIM_MS = 140;
const DEFAULT_WIDTH = 420;
const MIN_CARD_HEIGHT = 80;

/** Standard body text size used across popups. */
export const POPUP_BODY_SIZE = 14;

export interface PopupOpts {
  app: Application;
  /** Centered header text. Optional. */
  title?: string;
  /** Preferred content area width (px). Never exceeds 90% of the screen width. */
  width?: number;
  /** Fixed card height. When omitted the card sizes itself to the content and is capped at 60% of the screen height. */
  height?: number;
  /** Footer buttons, laid out in a fixed row below the (possibly scrolling) content area. */
  buttons?: Button[];
  /** Dim the screen behind and block map interaction. Default true. */
  modal?: boolean;
  /** Allow scroll gestures inside the content area when content overflows. Default true. */
  scrollable?: boolean;
  /** Close when the backdrop is tapped. Requires onClose. Default modal && !!onClose. */
  closeOnBackdrop?: boolean;
  /** Close on the Escape key. Requires onClose. Default true. */
  closeOnEscape?: boolean;
  /** The card itself captures pointer events inside it (blocks the map). Default true. */
  interactive?: boolean;
  /** Message mode: no chrome; the card shrinks to fit the content width. */
  fitContent?: boolean;
  /** Where to place the card: centered (default) or anchored to the top. */
  position?: 'center' | 'top';
  /** For position 'top': distance from the top of the screen to the card. */
  topY?: number;
  onClose?: () => void;
}

export class Popup {
  /** Root container: [backdrop, card]. Added by the caller to a parent container. */
  readonly el: Container;
  /** The content group. Add popup content children here (y starts at 0). It is clipped and can scroll. */
  readonly content: Container;
  readonly footer: Container;
  readonly isFixedHeight: boolean;
  /** Final inner content width in px. Use it for wrapping text so content never exceeds the card. */
  get contentWidth(): number {
    return this._contentWidth;
  }
  /** Inner content area height in px. Fixed-height popups know it immediately. */
  get contentAreaHeight(): number {
    return this.contentHeight;
  }
  get width(): number {
    return this.cardWidth;
  }
  get height(): number {
    return this.cardHeight;
  }

  /** Screen coordinates of the content area's top-left corner. */
  contentScreenOrigin(): { x: number; y: number } {
    const cardTop = this.positionTop ? this.topY : (this.app.screen.height - this.cardHeight) / 2;
    const cx = this.app.screen.width / 2 - this.cardWidth / 2;
    return { x: cx + PAD_H, y: cardTop + this.contentAreaY };
  }

  private readonly app: Application;
  private readonly opts: PopupOpts;
  private readonly backdrop: Graphics;
  private readonly shadow: Graphics;
  private readonly card: Container;
  private readonly bg: Graphics;
  private readonly viewport: Container;
  private readonly clip: Graphics;
  private readonly scrollPad: Graphics;
  private readonly titleText: Text | null;
  private readonly modal: boolean;
  private buttons: Button[] = [];
  private scrollable: boolean;
  private fitContent: boolean;
  private positionTop: boolean;
  private topY: number;
  private cardWidth = DEFAULT_WIDTH;
  private _contentWidth = 0;
  private cardHeight = 0;
  private contentHeight = 0;
  private contentAreaY = 0;
  private contentNaturalHeight = 0;
  private scrollOffset = 0;
  private scrollMax = 0;
  private closing = false;
  private disposed = false;
  private rafId: number | null = null;
  private pointerId: number | null = null;
  private lastClientY = 0;
  private listening = false;
  private tickerFn: ((t: { deltaMS: number }) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(opts: PopupOpts) {
    this.opts = opts;
    this.app = opts.app;
    this.modal = opts.modal ?? true;
    this.scrollable = opts.scrollable ?? true;
    this.fitContent = opts.fitContent ?? false;
    this.positionTop = (opts.position ?? 'center') === 'top';
    this.topY = opts.topY ?? 64;

    const screenW = this.app.screen.width;
    const screenH = this.app.screen.height;
    const maxW = Math.floor(screenW * 0.9);
    const maxH = Math.floor(screenH * 0.6);
    // In fit-content mode start at the width cap so text can wrap; the card
    // shrinks down to the actual content width during layout.
    this.cardWidth = this.fitContent ? maxW : Math.max(0, Math.min(opts.width ?? DEFAULT_WIDTH, maxW));
    this._contentWidth = Math.max(0, this.cardWidth - PAD_H * 2);

    this.el = new Container();

    this.backdrop = new Graphics();
    this.backdrop.rect(0, 0, screenW, screenH).fill({ color: BACKDROP_COLOR, alpha: this.modal ? BACKDROP_ALPHA : 0 });
    this.backdrop.alpha = 0;
    this.backdrop.eventMode = this.modal ? 'static' : 'none';
    if (this.modal) {
      this.backdrop.on('pointertap', () => {
        if (this.closing) return;
        if (opts.closeOnBackdrop ?? !!opts.onClose) opts.onClose?.();
      });
    }
    this.el.addChild(this.backdrop);

    this.shadow = new Graphics();
    this.el.addChild(this.shadow);

    this.card = new Container();
    const interactive = opts.interactive ?? true;
    this.card.eventMode = interactive ? 'static' : 'none';
    if (interactive) this.card.on('pointertap', () => {});
    this.bg = new Graphics();
    this.titleText = opts.title
      ? makeLabel(opts.title, { fontSize: 18, fill: 0xffffff, fontWeight: '700', wordWrap: true, wordWrapWidth: Math.max(120, this.contentWidth) })
      : null;

    this.viewport = new Container();
    this.viewport.eventMode = 'static';
    this.clip = new Graphics();
    this.scrollPad = new Graphics();
    this.content = new Container();
    this.content.eventMode = 'passive';
    this.footer = new Container();

    this.card.addChild(this.bg);
    if (this.titleText) this.card.addChild(this.titleText);
    this.card.addChild(this.viewport);
    this.card.addChild(this.footer);
    this.el.addChild(this.card);

    this.buttons = [...(opts.buttons ?? [])];
    this.buttons.forEach((b) => this.footer.addChild(b));

    this.isFixedHeight = opts.height !== undefined;
    if (this.isFixedHeight) {
      this.cardHeight = Math.max(MIN_CARD_HEIGHT, Math.min(opts.height!, maxH));
      this.contentHeight = Math.max(0, this.cardHeight - this.overhead());
    }

    if (opts.closeOnEscape ?? true) {
      this.keyHandler = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (this.closing) return;
          opts.onClose?.();
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  private overhead(): number {
    const titleH = this.titleText ? this.titleText.height + TITLE_GAP : 0;
    const buttons = this.measureButtons();
    const footerH = buttons.buttons.length > 0 ? FOOTER_GAP + buttons.height : 0;
    return PAD_TOP + titleH + footerH + PAD_BOTTOM;
  }

  private measureButtons(): { buttons: Button[]; width: number; height: number } {
    if (this.buttons.length === 0) return { buttons: this.buttons, width: 0, height: 0 };
    let height = 0;
    let width = 0;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i]!;
      height = Math.max(height, b.height);
      width += b.width;
      if (i > 0) width += BUTTON_GAP;
    }
    return { buttons: this.buttons, width, height };
  }

  private measureContentHeight(): number {
    const savedMask = this.content.mask;
    this.content.mask = null;
    let b: { maxY: number };
    try {
      b = this.content.getLocalBounds();
    } catch {
      b = { maxY: 0 };
    } finally {
      this.content.mask = savedMask;
    }
    if (Number.isFinite(b.maxY) && b.maxY > 0) return b.maxY;
    // Fallback: text/row metrics even when container bounds are not ready yet.
    let max = 0;
    for (const child of this.content.children) {
      const bottom = child.position.y + (child as { height: number }).height;
      if (Number.isFinite(bottom)) max = Math.max(max, bottom);
    }
    return max;
  }

  private measureContentWidth(): number {
    const savedMask = this.content.mask;
    this.content.mask = null;
    let b: { minX: number; maxX: number };
    try {
      b = this.content.getLocalBounds();
    } catch {
      b = { minX: 0, maxX: 0 };
    } finally {
      this.content.mask = savedMask;
    }
    if (Number.isFinite(b.maxX) && Number.isFinite(b.minX) && b.maxX > b.minX) return b.maxX - b.minX;
    let max = 0;
    for (const child of this.content.children) {
      const right = child.position.x + (child as { width: number }).width;
      if (Number.isFinite(right)) max = Math.max(max, right);
    }
    return max;
  }

  setButtons(buttons: Button[]): void {
    this.buttons = [...buttons];
    this.layoutCard();
  }

  /** Lay out the card and animate it in. Call after adding content children and footer buttons. */
  finish(): void {
    this.layoutCard();
    this.animateIn();
    // Text metrics can change once the web font is applied; re-measure on the
    // next frame so the card grows/shrinks (within the size cap) to fit text.
    if (typeof requestAnimationFrame === 'function' && !this.isFixedHeight) {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        if (!this.closing && !this.disposed) this.layoutCard();
      });
    }
  }

  /** Re-layout after content children changed (auto height + scroll state). */
  reflow(): void {
    this.layoutCard();
  }

  private layoutCard(): void {
    if (this.disposed) return;
    const buttons = this.measureButtons();
    if (this.fitContent) {
      const maxW = Math.floor(this.app.screen.width * 0.9);
      const naturalW = this.measureContentWidth();
      const newW = Math.max(0, Math.min(maxW, Math.ceil(naturalW) + PAD_H * 2));
      if (newW !== this.cardWidth) {
        this.cardWidth = newW;
        this._contentWidth = Math.max(0, newW - PAD_H * 2);
      }
    }
    const overhead = this.overhead();
    this.contentNaturalHeight = this.measureContentHeight();

    if (!this.isFixedHeight) {
      const screenH = this.app.screen.height;
      const maxH = Math.floor(screenH * 0.6);
      const natural = overhead + this.contentNaturalHeight;
      this.cardHeight = Math.max(MIN_CARD_HEIGHT, Math.min(natural, maxH));
      this.contentHeight = Math.max(0, this.cardHeight - overhead);
    }

    const titleH = this.titleText ? this.titleText.height : 0;
    const contentY = PAD_TOP + (titleH > 0 ? titleH + TITLE_GAP : 0);
    this.contentAreaY = contentY;
    const buttonsH = buttons.buttons.length > 0 ? buttons.height : 0;
    const footerY = this.cardHeight - PAD_BOTTOM - buttonsH;

    this.bg.clear().roundRect(0, 0, this.cardWidth, this.cardHeight, CARD_RADIUS).fill(CARD_COLOR);
    this.shadow.clear().roundRect(0, 0, this.cardWidth, this.cardHeight, CARD_RADIUS).fill({ color: 0x000000, alpha: SHADOW_ALPHA });
    const cardTop = this.positionTop ? this.topY : (this.app.screen.height - this.cardHeight) / 2;
    const shadowX = this.app.screen.width / 2 - this.cardWidth / 2 + SHADOW_OFFSET_X;
    const shadowY = cardTop + SHADOW_OFFSET_Y;
    this.shadow.position.set(shadowX, shadowY);
    this.card.pivot.set(this.cardWidth / 2, this.cardHeight / 2);
    this.card.position.set(this.app.screen.width / 2, cardTop + this.cardHeight / 2);
    if ((this.opts.interactive ?? true) && this.cardWidth > 0) {
      this.card.hitArea = { contains: (x: number, y: number): boolean =>
        x >= 0 && y >= 0 && x <= this.cardWidth && y <= this.cardHeight,
      };
    }

    if (this.titleText) {
      this.titleText.anchor.set(0.5, 0.5);
      this.titleText.position.set(this.cardWidth / 2, PAD_TOP + titleH / 2);
    }

    this.clip.clear().rect(0, 0, this.contentWidth, this.contentHeight).fill(CARD_COLOR);
    this.clip.position.set(0, 0);
    this.scrollPad.clear().rect(0, 0, this.contentWidth, this.contentHeight).fill({ color: 0x000000, alpha: 0.001 });
    this.scrollPad.position.set(0, 0);

    this.viewport.position.set(PAD_H, contentY);
    // addChild() moves existing children to the end, so calling in this order
    // keeps clip < pad < content (content on top) without detaching anything.
    this.viewport.addChild(this.clip);
    this.viewport.addChild(this.scrollPad);
    this.viewport.addChild(this.content);
    this.content.position.set(0, -this.scrollOffset);

    this.scrollMax = this.contentNaturalHeight > this.contentHeight ? this.contentNaturalHeight - this.contentHeight : 0;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.scrollMax));
    this.content.position.y = -this.scrollOffset;
    this.content.mask = this.clip;

    const canScroll = this.scrollMax > 0 && this.scrollable;
    this.scrollPad.eventMode = canScroll ? 'static' : 'none';
    if (canScroll) {
      this.enableScrollListeners();
    } else {
      this.disableScrollListeners();
    }

    this.footer.removeChildren();
    this.buttons.forEach((b) => this.footer.addChild(b));
    let bx = (this.cardWidth - buttons.width) / 2;
    this.footer.position.set(0, footerY);
    for (const b of this.buttons) {
      b.position.set(bx, 0);
      bx += b.width + BUTTON_GAP;
    }
  }

  private enableScrollListeners(): void {
    if (this.listening) return;
    this.listening = true;
    // Drags begin anywhere in the scrollable area (including over content
    // text/icons) so scrolling never depends on hitting the blank pad. Wheel
    // events bubble from interactive children through the viewport.
    this.scrollPad.on('pointerdown', this.onScrollPointerDown);
    this.viewport.on('pointerdown', this.onScrollPointerDown);
    this.scrollPad.on('wheel', this.onWheel);
    this.viewport.on('wheel', this.onWheel);
  }

  private disableScrollListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    this.scrollPad.off('pointerdown', this.onScrollPointerDown);
    this.viewport.off('pointerdown', this.onScrollPointerDown);
    this.scrollPad.off('wheel', this.onWheel);
    this.viewport.off('wheel', this.onWheel);
    this.pointerId = null;
  }

  private onWheel = (e: FederatedWheelEvent): void => {
    if (this.scrollMax <= 0 || e.deltaY === 0) return;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + e.deltaY, this.scrollMax));
    this.content.position.y = -this.scrollOffset;
  };

  private onScrollPointerDown = (e: FederatedPointerEvent): void => {
    if (this.scrollMax <= 0 || this.pointerId !== null || e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.lastClientY = e.clientY;
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const dy = e.clientY - this.lastClientY;
    this.lastClientY = e.clientY;
    if (dy === 0) return;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset - dy, this.scrollMax));
    this.content.position.y = -this.scrollOffset;
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
  };

  private animateIn(): void {
    this.card.scale.set(0.92);
    this.backdrop.alpha = 0;
    this.tween(ANIM_MS, (p) => {
      if (this.disposed) return;
      this.card.scale.set(0.92 + 0.08 * p);
      if (this.modal) this.backdrop.alpha = BACKDROP_ALPHA * p;
    });
  }

  /** Play the scale-out animation. Caller is responsible for destroying afterwards. */
  animateOut(onDone?: () => void): void {
    if (this.closing) {
      onDone?.();
      return;
    }
    this.closing = true;
    this.pointerId = null;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    this.tween(ANIM_MS, (p) => {
      if (this.disposed) return;
      this.card.scale.set(1 - 0.08 * p);
      if (this.modal) this.backdrop.alpha = BACKDROP_ALPHA * (1 - p);
    }, onDone);
  }

  private tween(durationMs: number, step: (p: number) => void, onDone?: () => void): void {
    const ticker = this.app.ticker;
    if (!ticker) {
      step(1);
      onDone?.();
      return;
    }
    let elapsed = 0;
    const fn = (t: { deltaMS: number }): void => {
      if (this.disposed) {
        ticker.remove(fn);
        this.tickerFn = null;
        return;
      }
      elapsed += t.deltaMS;
      const p = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      step(eased);
      if (p >= 1) {
        ticker.remove(fn);
        this.tickerFn = null;
        onDone?.();
      }
    };
    this.tickerFn = fn;
    ticker.add(fn);
  }

  destroy(): void {
    this.disposed = true;
    this.closing = true;
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    if (this.tickerFn && this.app.ticker) this.app.ticker.remove(this.tickerFn);
    this.tickerFn = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    this.disableScrollListeners();
    this.pointerId = null;
    if (this.el.parent) this.el.parent.removeChild(this.el);
    this.el.destroy({ children: true });
  }
}
