import { Application, Rectangle, type Ticker } from 'pixi.js';
import { HEX_TILT } from '../game/hex';
import {
  cameraPanStep,
  clampPan,
  clampZoom,
  dragLerpStep,
  fitScaleFor,
  inertiaStep,
  INERTIA_START_SPEED,
  maxZoomFor,
  qualityFactor,
  zoomAroundCursor,
  zoomInertiaStep,
  ZOOM_EPSILON,
} from '../game/zoom';

const DRAG_THRESHOLD = 5;
const CAMERA_DURATION_MS = 600;
const CAMERA_MARGIN_TILES = 2;
const START_ZOOM = 1.2;

export interface CameraContext {
  app: Application | null;
  hexSize: number;
  screenWidth(): number;
  mapHeight(): number;
  mapRadius(): number;
  onCameraChange(): void;
  /** Fired when the camera transitions between idle and busy (drag / pan
   *  inertia / pan animation / zoom easing). The host uses it to pause the
   *  decorative map animations while the camera is moving. */
  onBusyChange?(busy: boolean): void;
}

export class CameraController {
  baseScale = 1;
  zoom = 1;
  maxZoom = 2;
  qualityFactor = 1;
  spriteScale = 1;
  pan = { x: 0, y: 0 };

  private dragging = false;
  private dragActive = false;
  private dragPointerId = -1;
  private dragStart = { x: 0, y: 0 };
  private panStart = { x: 0, y: 0 };
  private dragLast = { x: 0, y: 0 };
  private dragLastTime = 0;
  private dragMoved = 0;
  private dragVelocity = { x: 0, y: 0 };
  /** Clamped follower position the drag eases the pan toward each frame. */
  private dragTarget = { x: 0, y: 0 };
  private dragLerpRemove: (() => void) | null = null;
  private inertiaRemove: (() => void) | null = null;
  private cameraRemove: (() => void) | null = null;
  private cameraResolve: (() => void) | null = null;
  private cameraStartPan = { x: 0, y: 0 };
  private cameraTarget = { x: 0, y: 0 };
  private cameraStartTime = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchActive = false;
  private pinchStartZoom = 1;
  private pinchStartDist = 0;
  private pinchStartMidpoint = { x: 0, y: 0 };
  private pinchStartPan = { x: 0, y: 0 };
  private pinchWorldAnchor = { x: 0, y: 0 };
  private zoomAnimRemove: (() => void) | null = null;
  private zoomTarget = 1;
  private zoomCursor = { x: 0, y: 0 };

  constructor(private readonly ctx: CameraContext) {}

  get scale(): number {
    return this.baseScale * this.zoom;
  }

  get isDragging(): boolean {
    return this.dragActive;
  }

  /** True while the user or an animation is moving the camera: dragging,
   *  pan inertia, a pan camera animation, or easing wheel zoom. */
  get isBusy(): boolean {
    return this.dragActive || !!this.inertiaRemove || !!this.cameraRemove || !!this.zoomAnimRemove;
  }

  /** Emits the current busy state to the host whenever it changes. Cheap to
   *  call repeatedly; the consumer's setter is idempotent. */
  private notifyBusy(): void {
    this.ctx.onBusyChange?.(this.isBusy);
  }

  viewportRect(): Rectangle {
    return new Rectangle(
      -this.pan.x / this.scale,
      -this.pan.y / this.scale,
      this.ctx.screenWidth() / this.scale,
      this.ctx.mapHeight() / this.scale,
    );
  }

  applyFitToScreen(): void {
    this.stopZoomAnim();
    const radius = this.ctx.mapRadius();
    const mapW = 2 * Math.sqrt(3) * radius * this.ctx.hexSize;
    const mapH = 2 * (1.5 * radius * this.ctx.hexSize * HEX_TILT);
    const fit = fitScaleFor(this.ctx.screenWidth(), this.ctx.mapHeight(), mapW, mapH) * START_ZOOM;
    // Narrow (tall/portrait) screens make the whole-map fit very small, so
    // start noticeably closer in on them.
    const aspect = this.ctx.screenWidth() / this.ctx.mapHeight();
    const narrowBoost = aspect < 1 ? 1.5 : 1;
    const designMaxZoom = maxZoomFor(this.ctx.mapHeight() / this.ctx.screenWidth());
    this.baseScale = fit * narrowBoost;
    this.zoom = 1;
    this.qualityFactor = qualityFactor(fit, window.devicePixelRatio, designMaxZoom);
    this.spriteScale = 1 / this.qualityFactor;
    // A baked texture pixel renders at baseScale * zoom / qualityFactor screen
    // px. Cap the zoom so textures are never upscaled past their native pixel
    // size on screen (avoids blurry art at high zoom on ultra-wide / low-DPR
    // displays, where qualityFactor is clamped by QUALITY_CAP). Floored at 1 so
    // the default fit view always stays reachable.
    this.maxZoom = Math.max(1, Math.min(designMaxZoom, this.qualityFactor / this.baseScale));
    this.pan = { x: this.ctx.screenWidth() / 2, y: this.ctx.mapHeight() / 2 };
    this.ctx.onCameraChange();
  }

  resetView(): void {
    this.stopCameraAnimation();
    this.stopInertia();
    this.stopZoomAnim();
    this.zoom = 1;
    this.pan = { x: this.ctx.screenWidth() / 2, y: this.ctx.mapHeight() / 2 };
    this.ctx.onCameraChange();
  }

  isWorldPointVisible(world: { x: number; y: number }, marginTiles = CAMERA_MARGIN_TILES): boolean {
    if (!this.ctx.app) return false;
    const sx = this.pan.x + world.x * this.scale;
    const sy = this.pan.y + world.y * this.scale;
    const margin = this.ctx.hexSize * this.scale * marginTiles;
    return (
      sx >= -margin &&
      sx <= this.ctx.screenWidth() + margin &&
      sy >= -margin &&
      sy <= this.ctx.mapHeight() + margin
    );
  }

  animateTo(target: { x: number; y: number }, clamp = true): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.ctx.app) {
        resolve();
        return;
      }
      this.stopCameraAnimation();
      this.stopInertia();
      this.cameraStartPan = { ...this.pan };
      this.cameraTarget = { ...target };
      this.cameraStartTime = performance.now();
      this.cameraResolve = resolve;
      const ticker = this.ctx.app.ticker;
      const fn = (t: Ticker): void => {
        const progress = Math.min(1, (performance.now() - this.cameraStartTime) / CAMERA_DURATION_MS);
        const step = cameraPanStep(this.cameraStartPan, this.cameraTarget, progress);
        this.pan = clamp
          ? clampPan(
              step,
              this.ctx.mapRadius(),
              this.ctx.hexSize,
              this.scale,
              this.ctx.screenWidth(),
              this.ctx.mapHeight(),
              HEX_TILT,
            )
          : step;
        this.ctx.onCameraChange();
        if (progress >= 1) this.stopCameraAnimation();
      };
      ticker.add(fn);
      this.cameraRemove = () => ticker.remove(fn);
      this.notifyBusy();
    });
  }

  handleWheel(deltaY: number, cursor: { x: number; y: number }): void {
    if (!this.ctx.app) return;
    this.stopCameraAnimation();
    this.stopInertia();
    this.stopZoomAnim();
    const factor = deltaY < 0 ? 1.5625 : 1 / 1.5625;
    const target = clampZoom(this.zoom * factor, this.maxZoom);
    if (Math.abs(target - this.zoom) < ZOOM_EPSILON) {
      this.zoom = target;
      this.ctx.onCameraChange();
      return;
    }
    this.zoomTarget = target;
    this.zoomCursor = { ...cursor };
    this.startZoomAnim();
  }

  /** Eases the zoom toward the wheel target under the released cursor, keeping
   *  the cursor's world point pinned underneath it. Frame-rate independent. */
  private startZoomAnim(): void {
    if (this.zoomAnimRemove || !this.ctx.app) return;
    const ticker = this.ctx.app.ticker;
    const fn = (t: Ticker): void => {
      const dt = Math.max(0.0001, Math.min(0.1, t.deltaMS / 1000));
      const step = zoomInertiaStep(this.zoom, this.zoomTarget, dt);
      const nextScale = this.baseScale * step.zoom;
      this.pan = zoomAroundCursor(this.zoomCursor, this.pan, this.scale, nextScale);
      this.zoom = step.zoom;
      this.ctx.onCameraChange();
      if (step.done) this.stopZoomAnim();
    };
    ticker.add(fn);
    this.zoomAnimRemove = () => ticker.remove(fn);
    this.notifyBusy();
  }

  private stopZoomAnim(): void {
    if (this.zoomAnimRemove) {
      const remover = this.zoomAnimRemove;
      this.zoomAnimRemove = null;
      remover();
      this.notifyBusy();
    }
  }

  handlePointerDown(pointerId: number, pos: { x: number; y: number }): void {
    if (!this.ctx.app) return;
    this.stopCameraAnimation();
    this.stopInertia();
    this.stopDragLerp();
    this.stopZoomAnim();
    this.dragging = true;
    this.dragActive = false;
    this.dragMoved = 0;
    this.dragVelocity = { x: 0, y: 0 };
    this.dragPointerId = pointerId;
    this.dragStart = { ...pos };
    this.dragLast = { ...pos };
    this.dragLastTime = performance.now();
    this.panStart = { ...this.pan };
    this.pointers.set(pointerId, { ...pos });
    if (this.pointers.size >= 2) {
      this.beginPinch();
      return;
    }
    try {
      this.ctx.app.canvas.setPointerCapture(pointerId);
    } catch {
      // pointer capture is best-effort (e.g. sandboxed iframe)
    }
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
    window.addEventListener('pointerup', this.onWindowUpPointer);
    window.addEventListener('pointercancel', this.onWindowUpPointer);
  }

  handlePointerMove(pointerId: number, pos: { x: number; y: number }): void {
    if (!this.pointers.has(pointerId)) return;
    this.pointers.set(pointerId, { ...pos });
    if (this.pinchActive) this.applyPinch();
  }

  private onWindowMove = (e: PointerEvent): void => {
    if (!this.dragging || !this.ctx.app) return;
    const dx = e.clientX - this.dragLast.x;
    const dy = e.clientY - this.dragLast.y;
    this.dragMoved += Math.hypot(dx, dy);
    const now = performance.now();
    const dt = Math.max(0.0001, (now - this.dragLastTime) / 1000);
    if (!this.dragActive && this.dragMoved > DRAG_THRESHOLD) {
      this.dragActive = true;
      this.panStart = { ...this.pan };
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.notifyBusy();
    }
    if (this.dragActive) {
      this.dragVelocity.x = this.dragVelocity.x * 0.8 + (dx / dt) * 0.2;
      this.dragVelocity.y = this.dragVelocity.y * 0.8 + (dy / dt) * 0.2;
      // Don't move the pan on the pointermove itself: store the new clamped
      // follower position and let a per-frame ticker ease the pan toward it,
      // so the map glides smoothly instead of snapping to the cursor.
      this.dragTarget = clampPan(
        {
          x: this.panStart.x + (e.clientX - this.dragStart.x),
          y: this.panStart.y + (e.clientY - this.dragStart.y),
        },
        this.ctx.mapRadius(),
        this.ctx.hexSize,
        this.scale,
        this.ctx.screenWidth(),
        this.ctx.mapHeight(),
        HEX_TILT,
      );
      this.startDragLerp();
    }
    this.dragLast = { x: e.clientX, y: e.clientY };
    this.dragLastTime = now;
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    this.dragActive = false;
    this.stopDragLerp();
    if (this.dragVelocity.x !== 0 || this.dragVelocity.y !== 0) {
      const speed = Math.hypot(this.dragVelocity.x, this.dragVelocity.y);
      if (speed >= INERTIA_START_SPEED) {
        this.startInertia();
        return;
      }
    }
    this.notifyBusy();
  };

  private onWindowUpPointer = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    if (this.pinchActive && this.pointers.size < 2) this.endPinch();
  };

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(b!.x - a!.x, b!.y - a!.y);
  }

  private pointerMidpoint(): { x: number; y: number } {
    const [a, b] = [...this.pointers.values()];
    return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  }

  private beginPinch(): void {
    if (this.pointers.size < 2) return;
    this.stopCameraAnimation();
    this.stopInertia();
    this.stopDragLerp();
    this.stopZoomAnim();
    this.pinchActive = true;
    this.dragging = false;
    this.dragActive = false;
    this.notifyBusy();
    this.pinchStartZoom = this.zoom;
    this.pinchStartDist = this.pointerDistance();
    this.pinchStartMidpoint = this.pointerMidpoint();
    this.pinchStartPan = { ...this.pan };
    const startScale = this.baseScale * this.pinchStartZoom;
    this.pinchWorldAnchor = {
      x: (this.pinchStartMidpoint.x - this.pinchStartPan.x) / startScale,
      y: (this.pinchStartMidpoint.y - this.pinchStartPan.y) / startScale,
    };
  }

  private applyPinch(): void {
    if (!this.pinchActive || this.pointers.size < 2 || !this.ctx.app) return;
    const dist = this.pointerDistance();
    const midpoint = this.pointerMidpoint();
    const nextZoom = clampZoom(this.pinchStartZoom * (dist / this.pinchStartDist), this.maxZoom);
    const nextScale = this.baseScale * nextZoom;
    this.zoom = nextZoom;
    this.pan = clampPan(
      {
        x: midpoint.x - this.pinchWorldAnchor.x * nextScale,
        y: midpoint.y - this.pinchWorldAnchor.y * nextScale,
      },
      this.ctx.mapRadius(),
      this.ctx.hexSize,
      this.baseScale * this.zoom,
      this.ctx.screenWidth(),
      this.ctx.mapHeight(),
      HEX_TILT,
    );
    this.ctx.onCameraChange();
  }

  private endPinch(): void {
    this.pinchActive = false;
  }

  /** Eases `pan` toward `dragTarget` every frame while dragging, giving the
   *  map a smooth glide instead of instanti pointer tracking. Idempotent. */
  private startDragLerp(): void {
    if (this.dragLerpRemove || !this.ctx.app) return;
    const ticker = this.ctx.app.ticker;
    const fn = (t: Ticker): void => {
      const dt = Math.max(0.0001, Math.min(0.1, t.deltaMS / 1000));
      const step = dragLerpStep(this.pan, this.dragTarget, dt);
      this.pan = step.pan;
      this.ctx.onCameraChange();
      if (step.done) this.stopDragLerp();
    };
    ticker.add(fn);
    this.dragLerpRemove = () => ticker.remove(fn);
  }

  private stopDragLerp(): void {
    if (this.dragLerpRemove) {
      const remover = this.dragLerpRemove;
      this.dragLerpRemove = null;
      remover();
    }
  }

  private startInertia(): void {
    if (!this.ctx.app || this.inertiaRemove) return;
    const scale = this.scale;
    const ticker = this.ctx.app.ticker;
    const fn = (t: Ticker): void => {
      const step = inertiaStep(
        this.pan,
        this.dragVelocity,
        t.deltaMS / 1000,
        this.ctx.mapRadius(),
        this.ctx.hexSize,
        scale,
        this.ctx.screenWidth(),
        this.ctx.mapHeight(),
        HEX_TILT,
      );
      this.pan = step.pan;
      this.dragVelocity = step.velocity;
      this.ctx.onCameraChange();
      if (step.done) this.stopInertia();
    };
    ticker.add(fn);
    this.inertiaRemove = () => ticker.remove(fn);
    this.notifyBusy();
  }

  stopInertia(): void {
    if (this.inertiaRemove) {
      this.inertiaRemove();
      this.inertiaRemove = null;
      this.notifyBusy();
    }
  }

  stopCameraAnimation(): void {
    if (this.cameraRemove) {
      const remove = this.cameraRemove;
      this.cameraRemove = null;
      remove();
      this.notifyBusy();
    }
    if (this.cameraResolve) {
      const resolve = this.cameraResolve;
      this.cameraResolve = null;
      resolve();
    }
  }

  destroy(): void {
    this.stopCameraAnimation();
    this.stopInertia();
    this.stopDragLerp();
    this.stopZoomAnim();
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    window.removeEventListener('pointerup', this.onWindowUpPointer);
    window.removeEventListener('pointercancel', this.onWindowUpPointer);
    this.pointers.clear();
    this.pinchActive = false;
  }
}
