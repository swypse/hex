import { Application, Container, Graphics, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';

export interface ScreenScrollOptions {
  bottomPad?: number;
  onScroll?: (offset: number) => void;
}

// Pointer travel (px) after which a press becomes a drag. Smaller presses keep
// working as taps on the control under the finger.
const DRAG_THRESHOLD = 6;

// Vertical scrolling for full-screen Pixi content that is taller than the
// viewport. Adds a transparent, full-screen "pad" behind the content so drags
// and wheel events are caught both on the content itself (events bubble up
// from interactive children) and on empty screen space around it.
export class ScreenScroll {
  readonly pad: Graphics;
  readonly content: Container;
  private readonly app: Application;
  private readonly bottomPad: number;
  private readonly onScroll: ((offset: number) => void) | undefined;
  private maxScroll = 0;
  private scroll = 0;
  private activePointer: number | null = null;
  private startClientY = 0;
  private startScroll = 0;
  private dragged = false;
  private listening = false;

  constructor(app: Application, root: Container, options: ScreenScrollOptions = {}) {
    this.app = app;
    this.bottomPad = options.bottomPad ?? 16;
    this.onScroll = options.onScroll;

    this.pad = new Graphics();
    this.pad.eventMode = 'static';
    this.content = new Container();
    this.content.eventMode = 'static';

    root.addChild(this.pad);
    root.addChild(this.content);

    // Drags may start anywhere: on the pad (empty space) or on the content
    // (including over buttons/text, whose pointerdown bubbles up to content).
    this.pad.on('pointerdown', this.onPointerDown);
    this.content.on('pointerdown', this.onPointerDown);
    for (const target of [this.content, this.pad]) {
      target.on('wheel', this.onWheel);
    }
    // Intercept taps in the capture phase so a tap that ends a real drag never
    // activates the control under the finger.
    this.content.on('pointertapcapture', this.onTapCapture);
    this.resize();
  }

  resize(): void {
    this.pad.clear();
    this.pad.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: 0x000000, alpha: 0.001 });
  }

  refresh(): void {
    const bounds = this.content.getLocalBounds();
    const bottom = Number.isFinite(bounds.maxY) ? bounds.maxY : 0;
    this.maxScroll = Math.max(0, bottom - (this.app.screen.height - this.bottomPad));
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this.apply();
  }

  reset(): void {
    this.scroll = 0;
    this.apply();
  }

  private clamp(): void {
    this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll));
  }

  private apply(): void {
    this.content.position.y = -this.scroll;
    this.onScroll?.(this.scroll);
  }

  private onWheel = (e: FederatedWheelEvent): void => {
    if (this.maxScroll <= 0 || e.deltaY === 0) return;
    this.scroll += e.deltaY;
    this.clamp();
    this.apply();
  };

  private onPointerDown = (e: FederatedPointerEvent): void => {
    if (this.maxScroll <= 0 || this.activePointer !== null || e.button !== 0) return;
    this.activePointer = e.pointerId;
    this.startClientY = e.clientY;
    this.startScroll = this.scroll;
    this.dragged = false;
    this.attachPointerListeners();
  };

  private onTapCapture = (e: FederatedPointerEvent): void => {
    // A drag moves the content in lockstep with the pointer, so without this
    // the finger would still be on the button it pressed and Pixi would fire
    // its tap at the end of the gesture.
    if (this.dragged && e.pointerId === this.activePointer) e.stopPropagation();
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    const delta = this.startClientY - e.clientY;
    if (!this.dragged) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      this.dragged = true;
    }
    this.scroll = this.startScroll + delta;
    this.clamp();
    this.apply();
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
    this.dragged = false;
    this.detachPointerListeners();
  };

  private attachPointerListeners(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  }

  private detachPointerListeners(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
  }

  destroy(): void {
    this.detachPointerListeners();
    this.pad.off('pointerdown', this.onPointerDown);
    this.content.off('pointerdown', this.onPointerDown);
    this.content.off('pointertapcapture', this.onTapCapture);
    for (const target of [this.content, this.pad]) {
      target.off('wheel', this.onWheel);
    }
    this.activePointer = null;
    this.dragged = false;
  }
}
