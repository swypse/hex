import { Container, Graphics } from 'pixi.js';
import { makeLabel } from './label';
import { THEME } from './theme';

const GAP = 10;
const TRI_H = 6;
const TRI_W = 12;

export class ActionTooltip {
  readonly el: Container;
  private readonly target: Container;
  private readonly parent: Container;
  private readonly onOver: () => void;
  private readonly onOut: () => void;

  constructor(parent: Container, target: Container, text: string) {
    this.target = target;
    this.parent = parent;

    const el = new Container();
    el.visible = false;
    el.zIndex = 100;

    const label = makeLabel(text, { fontSize: 13, fill: THEME.white });
    const padX = 10;
    const padY = 6;
    const w = label.width + padX * 2;
    const h = label.height + padY * 2;

    const body = new Graphics();
    body.roundRect(0, 0, w, h, 6).fill({ color: 0x000000, alpha: 0.92 });

    const tri = new Graphics();
    tri
      .moveTo(w / 2 - TRI_W / 2, h)
      .lineTo(w / 2 + TRI_W / 2, h)
      .lineTo(w / 2, h + TRI_H)
      .closePath()
      .fill(0x000000);

    label.position.set(padX, padY);
    el.addChild(body, tri, label);
    // Anchor the container at the triangle tip.
    el.pivot.set(w / 2, h + TRI_H);
    this.el = el;
    parent.addChild(el);

    this.onOver = (): void => this.show();
    this.onOut = (): void => this.hide();
    target.on('pointerover', this.onOver);
    target.on('pointerout', this.onOut);
  }

  private show(): void {
    const local = this.parent.toLocal(this.target.getGlobalPosition());
    const b = this.target.getLocalBounds();
    // Tip points at the button's visual top-center, GAP pixels above it.
    this.el.position.set(local.x + b.x + b.width / 2, local.y - GAP);
    this.el.visible = true;
  }

  private hide(): void {
    this.el.visible = false;
  }

  destroy(): void {
    this.target.off('pointerover', this.onOver);
    this.target.off('pointerout', this.onOut);
    this.el.destroy({ children: true });
  }
}
