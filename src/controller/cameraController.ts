import { Application, Rectangle, type Ticker } from 'pixi.js';
import { HEX_TILT } from '../game/hex';
import {
  cameraPanStep,
  clampPan,
  clampZoom,
  fitScaleFor,
  inertiaStep,
  INERTIA_START_SPEED,
  maxZoomFor,
  qualityFactor,
  zoomAroundCursor,
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

  constructor(private readonly ctx: CameraContext) {}

  get scale(): number {
    return this.baseScale * this.zoom;
  }

  get isDragging(): boolean {
    return this.dragActive;
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
    const radius = this.ctx.mapRadius();
    const mapW = 2 * Math.sqrt(3) * radius * this.ctx.hexSize;
    const mapH = 2 * (1.5 * radius * this.ctx.hexSize * HEX_TILT);
    const fit = fitScaleFor(this.ctx.screenWidth(), this.ctx.mapHeight(), mapW, mapH) * START_ZOOM;
    this.baseScale = fit;
    this.zoom = 1;
    this.maxZoom = maxZoomFor(this.ctx.mapHeight() / this.ctx.screenWidth());
    this.qualityFactor = qualityFactor(fit, window.devicePixelRatio, this.maxZoom);
    this.spriteScale = 1 / this.qualityFactor;
    this.pan = { x: this.ctx.screenWidth() / 2, y: this.ctx.mapHeight() / 2 };
    this.ctx.onCameraChange();
  }

  resetView(): void {
    this.stopCameraAnimation();
    this.stopInertia();
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
    });
  }

  handleWheel(deltaY: number, cursor: { x: number; y: number }): void {
    if (!this.ctx.app) return;
    this.stopCameraAnimation();
    this.stopInertia();
    const factor = deltaY < 0 ? 1.1 : 1 / 1.1;
    const nextZoom = clampZoom(this.zoom * factor, this.maxZoom);
    const nextScale = this.baseScale * nextZoom;
    this.pan = zoomAroundCursor(cursor, this.pan, this.scale, nextScale);
    this.zoom = nextZoom;
    this.ctx.onCameraChange();
  }

  handlePointerDown(pointerId: number, pos: { x: number; y: number }): void {
    if (!this.ctx.app) return;
    this.stopCameraAnimation();
    this.stopInertia();
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
    }
    if (this.dragActive) {
      this.dragVelocity.x = this.dragVelocity.x * 0.8 + (dx / dt) * 0.2;
      this.dragVelocity.y = this.dragVelocity.y * 0.8 + (dy / dt) * 0.2;
      this.pan = clampPan(
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
      this.ctx.onCameraChange();
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
    if (this.dragActive) {
      const speed = Math.hypot(this.dragVelocity.x, this.dragVelocity.y);
      if (speed >= INERTIA_START_SPEED) this.startInertia();
    }
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
    this.pinchActive = true;
    this.dragging = false;
    this.dragActive = false;
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
  }

  stopInertia(): void {
    if (this.inertiaRemove) {
      this.inertiaRemove();
      this.inertiaRemove = null;
    }
  }

  stopCameraAnimation(): void {
    if (this.cameraRemove) {
      this.cameraRemove();
      this.cameraRemove = null;
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
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
    window.removeEventListener('pointerup', this.onWindowUpPointer);
    window.removeEventListener('pointercancel', this.onWindowUpPointer);
    this.pointers.clear();
    this.pinchActive = false;
  }
}
