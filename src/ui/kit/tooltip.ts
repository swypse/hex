import { Application, Container, Graphics, Text } from 'pixi.js';
import { makeLabel } from './label';

const TRIANGLE_H = 8;
const TRIANGLE_W = 14;
const RADIUS = 6;
const PAD_X = 10;
const PAD_Y = 8;

function isInside(node: Container | null, root: Container): boolean {
  let cur: Container | null = node;
  while (cur) {
    if (cur === root) return true;
    cur = cur.parent;
  }
  return false;
}

export class Tooltip {
  readonly el: Container;
  private readonly bg: Graphics;
  private readonly title: Text;
  private readonly text: Text;
  private readonly app: Application;
  private readonly stage: Container;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private target: Container | null = null;

  constructor(app: Application) {
    this.app = app;
    this.stage = app.stage;
    this.el = new Container();
    this.el.visible = false;
    this.el.eventMode = 'static';
    this.el.zIndex = 1000;
    this.bg = new Graphics();
    this.title = makeLabel('', { fontSize: 14, fill: 0xffffff, fontWeight: '700' });
    this.text = makeLabel('', { fontSize: 13, fill: 0xeeeeee });
    this.el.addChild(this.bg, this.title, this.text);
    this.el.on('pointerover', () => this.cancelHide());
    this.el.on('pointerout', () => this.hideAfter(500));
    this.stage.on('pointerdown', this.onStageDown);
  }

  private onStageDown = (event: { target: Container }): void => {
    if (!this.el.visible || !this.target) return;
    if (event.target === this.target) return;
    if (isInside(event.target, this.el)) return;
    this.hide();
  };

  showFor(target: Container, title: string, text: string): void {
    this.cancelTimers();
    this.setContent(target, title, text);
    this.el.visible = true;
  }

  showForAfter(target: Container, title: string, text: string, ms: number): void {
    this.cancelTimers();
    this.setContent(target, title, text);
    this.el.visible = false;
    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      this.el.visible = true;
    }, ms);
  }

  hideAfter(ms: number): void {
    this.cancelShow();
    if (!this.el.visible) return;
    if (this.hideTimer !== null) return;
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.hide();
    }, ms);
  }

  hide(): void {
    this.cancelTimers();
    this.el.visible = false;
  }

  destroy(): void {
    this.cancelTimers();
    this.stage.off('pointerdown', this.onStageDown);
    this.el.destroy({ children: true });
  }

  private setContent(target: Container, title: string, text: string): void {
    this.target = target;
    this.title.text = title;
    this.text.text = text;
    const boxW = Math.max(this.title.width, this.text.width) + PAD_X * 2;
    const boxH = this.title.height + 4 + this.text.height + PAD_Y * 2;
    const global = target.getGlobalPosition();
    const boxX = this.app.screen.width / 2 - boxW / 2;
    const triX = global.x - boxX;
    const boxY = global.y + target.height / 2;
    this.bg.clear()
      .moveTo(triX, 0).lineTo(triX - TRIANGLE_W / 2, TRIANGLE_H).lineTo(triX + TRIANGLE_W / 2, TRIANGLE_H).closePath()
      .fill({ color: 0x000000, alpha: 0.8 })
      .roundRect(0, TRIANGLE_H, boxW, boxH, RADIUS).fill({ color: 0x000000, alpha: 0.8 });
    this.title.position.set(PAD_X, TRIANGLE_H + PAD_Y);
    this.text.position.set(PAD_X, TRIANGLE_H + PAD_Y + this.title.height + 4);
    this.el.position.set(boxX, boxY);
  }

  private cancelShow(): void {
    if (this.showTimer !== null) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
  }

  private cancelHide(): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private cancelTimers(): void {
    this.cancelShow();
    this.cancelHide();
  }
}
