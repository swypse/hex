import { Application, Container, Graphics, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';

export interface ScreenScrollOptions {
  bottomPad?: number;
  onScroll?: (offset: number) => void;
}

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
  private lastClientY = 0;
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

    // Drags begin only on the pad (empty space beside/between the content),
    // never on interactive children: a drag that starts on a button would keep
    // that button under the finger as the content scrolls, making Pixi fire a
    // tap on it. Wheel events bubble from the content's children.
    this.pad.on('pointerdown', this.onPointerDown);
    for (const target of [this.content, this.pad]) {
      target.on('wheel', this.onWheel);
    }
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
    e.preventDefault();
    this.scroll += e.deltaY;
    this.clamp();
    this.apply();
  };

  private onPointerDown = (e: FederatedPointerEvent): void => {
    if (this.maxScroll <= 0 || this.activePointer !== null || e.button !== 0) return;
    this.activePointer = e.pointerId;
    this.lastClientY = e.clientY;
    this.attachPointerListeners();
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    const dy = e.clientY - this.lastClientY;
    this.lastClientY = e.clientY;
    if (dy === 0) return;
    this.scroll -= dy;
    this.clamp();
    this.apply();
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = null;
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
    for (const target of [this.content, this.pad]) {
      target.off('wheel', this.onWheel);
    }
    this.activePointer = null;
  }
}
