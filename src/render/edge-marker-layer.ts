import { Application, Container, FillGradient, Graphics } from 'pixi.js';
import { hexToPixel } from '../game/map/hex';
import { type GameMap } from '../game/map/map-gen';
import { isExploredFor } from '../game/map/explore';
import {
  CAPTURE_EDGE_GLOW_ALPHA,
  CAPTURE_EDGE_GLOW_DEPTH,
  CAPTURE_EDGE_GLOW_MIN_ALPHA,
  CAPTURE_EDGE_GLOW_PULSE_SCALE,
  CAPTURE_EDGE_GLOW_RADIUS,
  CAPTURE_EDGE_PULSE_MS,
} from './capture-marker';
import { type Viewport } from './tile-signature';
import { CaptureMarkerSide } from '@enums';
import { clamp } from '../util/math';

let glowGradient: FillGradient | null = null;

/** Radial red gradient shared by every glow: `CAPTURE_EDGE_GLOW_ALPHA` at the
 *  centre, transparent at the rim. Local texture space, so it fits any circle. */
function glowFill(): FillGradient {
  glowGradient ??= new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `rgba(235, 31, 0, ${CAPTURE_EDGE_GLOW_ALPHA})` },
      { offset: 1, color: 'rgba(235, 31, 0, 0)' },
    ],
    textureSpace: 'local',
  });
  return glowGradient;
}

export interface EdgeMarkerLayerDeps {
  app: Application;
  hexSize: number;
  getMap: () => GameMap | null;
  getLocalIndex: () => number;
  isCameraBusy: () => boolean;
}

/** Red glows centred on the screen edge, level with off-screen villages ready to be captured. */
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
      // The glow's centre sits exactly on the village's own screen coordinate
      // along the chosen edge: its x for top/bottom edges and its y for
      // left/right edges, so it points precisely at the off-screen village.
      const along = side === CaptureMarkerSide.LEFT || side === CaptureMarkerSide.RIGHT ? clamp(sy, 0, H) : clamp(sx, 0, W);
      const g = new Graphics();
      g.circle(0, 0, CAPTURE_EDGE_GLOW_RADIUS).fill(glowFill());
      g.position.set(...edgePoint(side, along, W, H));
      this.container.addChild(g);
      parts.push({ g, side, along, W, H });
    }
    this.parts = parts;
    if (parts.length === 0) {
      this.stopPulse();
      return;
    }
    // The pulse animation is continuous: rebuilding the marker set must not
    // restart its phase clock, or the marker would visibly jump back on every
    // unrelated map update. Just (re)draw at the current phase instead.
    this.redraw();
    this.startPulse();
  }

  /** Breathes every glow: `k` runs 0..1 (a full in-out per pulse). */
  private draw(k: number): void {
    const scale = 1 + (CAPTURE_EDGE_GLOW_PULSE_SCALE - 1) * k;
    const alpha = CAPTURE_EDGE_GLOW_MIN_ALPHA + (1 - CAPTURE_EDGE_GLOW_MIN_ALPHA) * (1 - k);
    for (const part of this.parts) {
      // Squashed to half along the axis facing into the screen: a half-width glow hugging the edge.
      const horizontalEdge = part.side === CaptureMarkerSide.TOP || part.side === CaptureMarkerSide.BOTTOM;
      part.g.scale.set(horizontalEdge ? scale : scale * CAPTURE_EDGE_GLOW_DEPTH, horizontalEdge ? scale * CAPTURE_EDGE_GLOW_DEPTH : scale);
      part.g.alpha = alpha;
    }
  }

  /** Draw the markers at the animation phase in effect right now. */
  private redraw(): void {
    const t = ((performance.now() - (this.pulseStart ?? performance.now())) % CAPTURE_EDGE_PULSE_MS) / CAPTURE_EDGE_PULSE_MS;
    this.draw(0.5 - 0.5 * Math.cos(t * Math.PI * 2));
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
      this.draw(0.5 - 0.5 * Math.cos(t * Math.PI * 2));
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

/** Screen point on the given edge at `along` px from the top/left corner. */
function edgePoint(side: CaptureMarkerSide, along: number, W: number, H: number): [number, number] {
  switch (side) {
    case CaptureMarkerSide.TOP:
      return [along, 0];
    case CaptureMarkerSide.BOTTOM:
      return [along, H];
    case CaptureMarkerSide.LEFT:
      return [0, along];
    case CaptureMarkerSide.RIGHT:
      return [W, along];
  }
}
