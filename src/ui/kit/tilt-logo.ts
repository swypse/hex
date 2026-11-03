import { Container, PerspectiveMesh, type Texture } from 'pixi.js';
import { clamp } from '../../util/math';

/** Max rotation around each axis (radians) at the screen edge. */
const MAX_TILT = (14 * Math.PI) / 180;
/** Camera distance in logo widths: smaller = stronger perspective. */
const CAMERA_DISTANCE = 4;
/** Per-frame easing towards the target tilt and the rest threshold. */
const EASE = 0.12;
const EPSILON = 0.0005;

/** A logo that is pseudo-3D rotated around the x and y axes (never z) towards
 *  the pointer: a textured plane whose corners are rotated and perspective
 *  projected. `update` eases the tilt and returns true while it still moves. */
export class TiltLogo extends Container {
  private readonly mesh: PerspectiveMesh;
  private tiltX = 0;
  private tiltY = 0;
  private targetX = 0;
  private targetY = 0;

  constructor(texture: Texture, private readonly logoW: number, private readonly logoH: number) {
    super();
    this.mesh = new PerspectiveMesh({ texture, verticesX: 12, verticesY: 12 });
    this.addChild(this.mesh);
    this.project();
  }

  /** Pointer offset from the logo's neighbourhood in -1..1 on both axes. */
  setPointer(nx: number, ny: number): void {
    // Pointer right → the right edge turns away (rotation about the y axis);
    // pointer down → the bottom edge turns away (about the x axis).
    this.targetY = clamp(nx, -1, 1) * MAX_TILT;
    this.targetX = -clamp(ny, -1, 1) * MAX_TILT;
  }

  update(): boolean {
    const dx = this.targetX - this.tiltX;
    const dy = this.targetY - this.tiltY;
    if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return false;
    this.tiltX += dx * EASE;
    this.tiltY += dy * EASE;
    this.project();
    return true;
  }

  private project(): void {
    const d = this.logoW * CAMERA_DISTANCE;
    const cx = Math.cos(this.tiltX);
    const sx = Math.sin(this.tiltX);
    const cy = Math.cos(this.tiltY);
    const sy = Math.sin(this.tiltY);
    const hw = this.logoW / 2;
    const hh = this.logoH / 2;
    const out: number[] = [];
    // Corner order of PerspectiveMesh: top-left, top-right, bottom-right, bottom-left.
    for (const [x, y] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as const) {
      // Rotate about the y axis, then the x axis.
      const x1 = x * cy;
      const z1 = -x * sy;
      const y2 = y * cx - z1 * sx;
      const z2 = y * sx + z1 * cx;
      const k = d / (d - z2);
      out.push(x1 * k, y2 * k);
    }
    this.mesh.setCorners(out[0]!, out[1]!, out[2]!, out[3]!, out[4]!, out[5]!, out[6]!, out[7]!);
  }
}
