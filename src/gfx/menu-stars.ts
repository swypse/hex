import { type Application, type Container } from 'pixi.js';
import { StarField } from './star-field';

/** Idle drift speed (px/s) and the share of the pointer offset the stars follow. */
const DRIFT = 10;
const POINTER_SHARE = 0.3;
const POINTER_EASE = 0.06;

/** The menu screens' star background: a `StarField` that drifts slowly and
 *  shifts a little away from the pointer. */
export class MenuStars {
  private readonly field: StarField;
  private readonly pointer = { x: 0, y: 0, easedX: 0, easedY: 0 };

  /** `parent` receives the field at child `index` (default: on top). */
  constructor(private readonly app: Application, parent: Container, index?: number) {
    this.field = new StarField(app, this.pan);
    if (index === undefined) parent.addChild(this.field.el);
    else parent.addChildAt(this.field.el, index);
    window.addEventListener('pointermove', this.onPointerMove);
  }

  private onPointerMove = (e: PointerEvent): void => {
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
  };

  private pan = (): { x: number; y: number } => {
    const { width, height } = this.app.screen;
    const p = this.pointer;
    p.easedX += (p.x - width / 2 - p.easedX) * POINTER_EASE;
    p.easedY += (p.y - height / 2 - p.easedY) * POINTER_EASE;
    return {
      x: (performance.now() / 1000) * DRIFT - p.easedX * POINTER_SHARE,
      y: -p.easedY * POINTER_SHARE,
    };
  };

  destroy(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    this.field.destroy();
  }
}
