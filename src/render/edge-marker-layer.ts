import { Application, Container, Graphics } from 'pixi.js';
import { hexToPixel } from '../game/map/hex';
import { type GameMap } from '../game/map/map-gen';
import { isExploredFor } from '../game/map/explore';
import { captureMarkerPoints, CAPTURE_EDGE_MARKER_ALPHA, CAPTURE_EDGE_MARKER_SIZE, CAPTURE_EDGE_MARKER_SLIDE, CAPTURE_EDGE_PULSE_MS } from './capture-marker';
import { type Viewport } from './tile-signature';
import { THEME } from '../gfx/theme';
import { CaptureMarkerSide } from '@enums';
import { clamp } from '../util/math';

export interface EdgeMarkerLayerDeps {
  app: Application;
  hexSize: number;
  getMap: () => GameMap | null;
  getLocalIndex: () => number;
  isCameraBusy: () => boolean;
}

/** Arrows on the screen edges that point at off-screen villages ready to be captured. */
export class EdgeMarkerLayer {
  readonly container = new Container();
  private parts: { g: Graphics; side: CaptureMarkerSide; along: number; W: number; H: number }[] = [];
  private stopPulseFn: (() => void) | null = null;
  private pulseStart: number | null = null;

  constructor(private readonly deps: EdgeMarkerLayerDeps) {}

  /** Puts the layer on top of `target` (as its first child, so real overlays still render above it). */
  attachTo(target: Container): void {
    this.container.removeFromParent();
    target.addChildAt(this.container, 0);
  }

  destroy(): void {
    this.stopPulse();
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  sync(viewport: Viewport): void {
    this.container.removeChildren().forEach((c) => c.destroy());
    this.parts = [];
    const map = this.deps.getMap();
    if (!map || viewport.width <= 0 || viewport.height <= 0) {
      this.stopPulse();
      return;
    }
    const W = viewport.width;
    const H = viewport.height;
    const parts: { g: Graphics; side: CaptureMarkerSide; along: number; W: number; H: number }[] = [];
    for (const tile of map.tiles) {
      const st = tile.settlement;
      if (!st || !st.captureReady) continue;
      const u = tile.unit;
      if (!u || u.owner === st.owner) continue;
      if (!isExploredFor(tile, this.deps.getLocalIndex())) continue;
      const w = hexToPixel(tile, this.deps.hexSize);
      const sx = viewport.x + w.x * viewport.scale;
      const sy = viewport.y + w.y * viewport.scale;
      if (sx >= 0 && sx <= W && sy >= 0 && sy <= H) continue;
      const dx = sx < 0 ? -sx : sx > W ? sx - W : 0;
      const dy = sy < 0 ? -sy : sy > H ? sy - H : 0;
      const side: CaptureMarkerSide = dx >= dy ? (sx < 0 ? CaptureMarkerSide.LEFT : CaptureMarkerSide.RIGHT) : sy < 0 ? CaptureMarkerSide.TOP : CaptureMarkerSide.BOTTOM;
      // The marker sits exactly on the village's own screen coordinate along
      // the chosen edge: its x for top/bottom edges and its y for left/right
      // edges, so it points precisely at the off-screen village.
      const halfLen = CAPTURE_EDGE_MARKER_SIZE / 2;
      let along: number;
      if (side === CaptureMarkerSide.LEFT || side === CaptureMarkerSide.RIGHT) along = clamp(sy, halfLen, H - halfLen);
      else along = clamp(sx, halfLen, W - halfLen);
      const g = new Graphics();
      g.alpha = CAPTURE_EDGE_MARKER_ALPHA;
      this.container.addChild(g);
      parts.push({ g, side, along, W, H });
    }
    this.parts = parts;
    if (parts.length === 0) {
      this.stopPulse();
      return;
    }
    // The slide animation is continuous: rebuilding the marker set must not
    // restart its phase clock, or the marker would visibly jump back on every
    // unrelated map update. Just (re)draw at the current phase instead.
    this.redraw();
    this.startPulse();
  }

  private draw(slide: number): void {
    const white = 0xffffff;
    for (const part of this.parts) {
      part.g.clear();
      const pts = captureMarkerPoints(part.side, part.along, slide, part.W, part.H, CAPTURE_EDGE_MARKER_SIZE);
      part.g.poly(pts).fill(THEME.map.selected).stroke({ width: 2, color: white, alignment: 0 });
    }
  }

  /** Draw the markers at the animation phase in effect right now. */
  private redraw(): void {
    const t = ((performance.now() - (this.pulseStart ?? performance.now())) % CAPTURE_EDGE_PULSE_MS) / CAPTURE_EDGE_PULSE_MS;
    const slide = CAPTURE_EDGE_MARKER_SLIDE * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
    this.draw(slide);
  }

  private startPulse(): void {
    if (this.stopPulseFn) return; // already running — keep the same phase clock
    if (this.parts.length === 0) return;
    const ticker = this.deps.app.ticker;
    this.pulseStart = performance.now();
    const fn = (): void => {
      if (this.deps.isCameraBusy()) return;
      if (this.parts.length === 0) {
        ticker.remove(fn);
        this.stopPulseFn = null;
        return;
      }
      const t = ((performance.now() - this.pulseStart!) % CAPTURE_EDGE_PULSE_MS) / CAPTURE_EDGE_PULSE_MS;
      const slide = CAPTURE_EDGE_MARKER_SLIDE * (0.5 - 0.5 * Math.cos(t * Math.PI * 2));
      this.draw(slide);
    };
    ticker.add(fn);
    this.stopPulseFn = () => ticker.remove(fn);
  }

  stopPulse(): void {
    if (this.stopPulseFn) {
      this.stopPulseFn();
      this.stopPulseFn = null;
    }
    this.pulseStart = null;
  }
}
