import { Application, Container } from 'pixi.js';
import { ignoreTickerListener } from './render-gate';

/** The two method call sites of the WebGL2 API that map 1:1 to hardware draw
 *  calls (each non-instanced batch ends in one of them). */
export interface GlDrawCallContext {
  drawArrays(mode: number, first: number, count: number): void;
  drawElements(mode: number, count: number, type: number, offset: number): void;
}

export interface GlDrawCounter {
  readonly count: number;
  restore(): void;
}

interface GlCounterState {
  count: number;
  applied: boolean;
  original: Partial<Record<'drawArrays' | 'drawElements', (...args: number[]) => void>>;
}

const glCounterStates = new WeakMap<GlDrawCallContext, GlCounterState>();

/** Wraps a WebGL2 context's `drawArrays`/`drawElements` so every draw call the
 *  Pixi renderer issues is counted. Innocuous ~sub-nanosecond per-call
 *  overhead. Idempotent per context: re-wrapping (e.g. after a restore on
 *  remount) returns a counter over the same state and re-applies the patch
 *  when it is currently unwrapped. `restore()` puts the original methods back
 *  and is safe to call repeatedly. */
export function wrapGlDrawCalls(gl: GlDrawCallContext): GlDrawCounter {
  let state = glCounterStates.get(gl);
  if (!state) {
    state = { count: 0, applied: false, original: {} };
    glCounterStates.set(gl, state);
  }
  applyGlPatch(gl, state);
  return {
    get count(): number {
      return state.count;
    },
    restore(): void {
      unapplyGlPatch(gl, state);
    },
  };
}

function applyGlPatch(gl: GlDrawCallContext, state: GlCounterState): void {
  if (state.applied) return;
  state.original.drawArrays = gl.drawArrays.bind(gl);
  state.original.drawElements = gl.drawElements.bind(gl);
  gl.drawArrays = ((mode: number, first: number, count: number): void => {
    state.count++;
    state.original.drawArrays!(mode, first, count);
  }) as GlDrawCallContext['drawArrays'];
  gl.drawElements = ((mode: number, count: number, type: number, offset: number): void => {
    state.count++;
    state.original.drawElements!(mode, count, type, offset);
  }) as GlDrawCallContext['drawElements'];
  state.applied = true;
}

function unapplyGlPatch(gl: GlDrawCallContext, state: GlCounterState): void {
  if (!state.applied) return;
  if (state.original.drawArrays) gl.drawArrays = state.original.drawArrays;
  if (state.original.drawElements) gl.drawElements = state.original.drawElements;
  state.original = {};
  state.applied = false;
}

/** Counts every visible, renderable node under `root` (containers included).
 *  An invisible parent prunes its whole subtree. The root itself counts when
 *  visible. A cheap proxy for scene complexity sampled a few times per second. */
export function countRenderObjects(root: Container): number {
  let n = 0;
  const stack: Container[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (!node.visible || !node.renderable) continue;
    n++;
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child) stack.push(child);
    }
  }
  return n;
}

/** Averages per-frame deltas into frame ms + derived fps. Non-positive deltas
 *  (paused/long jank) are ignored; an empty window yields zeros. */
export function summarizeFrameTimes(deltas: number[]): { fps: number; frameMs: number } {
  const valid = deltas.filter((d) => d > 0);
  if (valid.length === 0) return { fps: 0, frameMs: 0 };
  const frameMs = valid.reduce((a, b) => a + b, 0) / valid.length;
  return { fps: 1000 / frameMs, frameMs };
}

/** Spike statistics of a frame-time window: the worst frame and how many frames
 *  missed 30 fps (> 33 ms) and 20 fps (> 50 ms). The average hides these. */
export function summarizeSpikes(deltas: number[]): { maxMs: number; slow33: number; slow50: number } {
  let maxMs = 0;
  let slow33 = 0;
  let slow50 = 0;
  for (const d of deltas) {
    if (d > maxMs) maxMs = d;
    if (d > 33.4) slow33++;
    if (d > 50) slow50++;
  }
  return { maxMs, slow33, slow50 };
}

export interface PerfSnapshot {
  /** Displayable frames per second. */
  fps: number;
  /** Average frame time in ms (1 decimal). */
  frameMs: number;
  /** Worst frame interval in the window, ms (1 decimal). */
  maxMs: number;
  /** Frames longer than 33 ms / 50 ms in the window. */
  slow33: number;
  slow50: number;
  /** Main-thread CPU time of `renderer.render` (scene traversal + command
   *  submission, not GPU execution): average and worst, ms. A frame time far
   *  above this points at the GPU / compositor, not JS. */
  renderMsAvg: number;
  renderMsMax: number;
  /** Long animation frames (main thread busy > 50 ms) in the window and the
   *  longest one in ms; null where the browser lacks the API. */
  longFrames: { count: number; maxMs: number } | null;
  /** Real GL draw calls since the last sample, or null on WebGPU. */
  drawCalls: number | null;
  /** Visible renderable scene nodes under the stage. */
  renderObjects: number;
  /** GPU texture sources currently managed by the renderer. */
  textures: number;
  /** Chromium-only JS heap in MB, or null elsewhere. */
  heapMb: number | null;
}

const SAMPLE_MS = 500;
/** Tick gaps at or above this are treated as the page being paused, not a frame. */
const BACKGROUND_GAP_MS = 1000;

const EMPTY_SNAPSHOT: PerfSnapshot = {
  fps: 0,
  frameMs: 0,
  maxMs: 0,
  slow33: 0,
  slow50: 0,
  renderMsAvg: 0,
  renderMsMax: 0,
  longFrames: null,
  drawCalls: null,
  renderObjects: 0,
  textures: 0,
  heapMb: null,
};

/** Samples frame timing from the app ticker and scene/renderer state a few
 *  times a second, then exposes the latest `PerfSnapshot`. WebGL renderers get
 *  an exact draw-call counter by wrapping `drawArrays`/`drawElements`; WebGPU
 *  has no such hook, so `drawCalls` stays null there. */
export class PerfStats {
  private readonly app: Application;
  private started = false;
  private tickerCb: (() => void) | null = null;
  private counter: GlDrawCounter | null = null;
  private prevDraws = 0;
  private readonly deltas: number[] = [];
  private lastTickAt = 0;
  private windowStart = 0;
  private renderTimes: number[] = [];
  private restoreRender: (() => void) | null = null;
  private loafObserver: PerformanceObserver | null = null;
  private loaf: number[] = [];
  private last: PerfSnapshot = { ...EMPTY_SNAPSHOT };

  constructor(app: Application) {
    this.app = app;
  }

  /** Starts sampling + the GL wrap. Idempotent. */
  begin(): void {
    if (this.started) return;
    this.started = true;
    const gl = resolveGlContext(this.app);
    this.counter = gl ? wrapGlDrawCalls(gl) : null;
    this.prevDraws = this.counter?.count ?? 0;
    this.deltas.length = 0;
    this.lastTickAt = performance.now();
    this.windowStart = this.lastTickAt;
    this.restoreRender = this.timeRenders();
    this.loafObserver = this.observeLongFrames();
    this.tickerCb = () => this.onTick();
    // The sampler doesn't touch visuals, so it must not keep the render gate open.
    ignoreTickerListener(this.tickerCb);
    this.app.ticker.add(this.tickerCb);
  }

  /** Stops sampling and unwraps the GL context. Idempotent. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.tickerCb) this.app.ticker.remove(this.tickerCb);
    this.tickerCb = null;
    this.counter?.restore();
    this.counter = null;
    this.restoreRender?.();
    this.restoreRender = null;
    this.loafObserver?.disconnect();
    this.loafObserver = null;
  }

  /** Wraps `renderer.render` to time its main-thread cost. Returns an undo. */
  private timeRenders(): () => void {
    const renderer = this.app.renderer as unknown as { render?: (...args: unknown[]) => void } | undefined;
    const original = renderer?.render;
    if (!renderer || typeof original !== 'function') return () => {};
    renderer.render = (...args: unknown[]): void => {
      const t0 = performance.now();
      original.apply(renderer, args);
      this.renderTimes.push(performance.now() - t0);
    };
    return () => {
      renderer.render = original;
    };
  }

  private observeLongFrames(): PerformanceObserver | null {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) this.loaf.push(entry.duration);
      });
      observer.observe({ type: 'long-animation-frame', buffered: false });
      return observer;
    } catch {
      return null; // unsupported (Safari, Firefox)
    }
  }

  getSnapshot(): PerfSnapshot {
    return this.last;
  }

  private onTick(): void {
    // Raw interval between ticks: ticker.deltaMS is clamped by Pixi and would
    // hide the very spikes this panel exists to show.
    const now = performance.now();
    const gap = now - this.lastTickAt;
    this.lastTickAt = now;
    // A gap this long is the page having been backgrounded / frozen, not a slow frame.
    if (gap < BACKGROUND_GAP_MS) this.deltas.push(gap);
    if (now - this.windowStart < SAMPLE_MS) return;
    const { fps, frameMs } = summarizeFrameTimes(this.deltas);
    const spikes = summarizeSpikes(this.deltas);
    const renders = this.renderTimes;
    const draws = this.counter ? this.counter.count : 0;
    const renderObjects = countRenderObjects(this.app.stage);
    const textures = managedTextureCount(this.app.renderer);
    this.last = {
      fps: Math.round(fps),
      frameMs: Math.round(frameMs * 10) / 10,
      maxMs: Math.round(spikes.maxMs * 10) / 10,
      slow33: spikes.slow33,
      slow50: spikes.slow50,
      renderMsAvg: renders.length ? Math.round((renders.reduce((a, b) => a + b, 0) / renders.length) * 10) / 10 : 0,
      renderMsMax: renders.length ? Math.round(Math.max(...renders) * 10) / 10 : 0,
      longFrames: this.loafObserver ? { count: this.loaf.length, maxMs: Math.round(Math.max(0, ...this.loaf)) } : null,
      drawCalls: this.counter ? draws - this.prevDraws : null,
      renderObjects,
      textures,
      heapMb: heapSizeMb(),
    };
    this.prevDraws = draws;
    this.deltas.length = 0;
    this.renderTimes = [];
    this.loaf = [];
    this.windowStart = now;
  }
}

/** Lazily-created process-wide stats collector for the app's renderer. */
let statsInstance: PerfStats | null = null;
export function perfStatsFor(app: Application): PerfStats {
  return (statsInstance ??= new PerfStats(app));
}

function resolveGlContext(app: Application): GlDrawCallContext | null {
  const raw = app.renderer as unknown as { context?: { context?: unknown } } | undefined;
  const ctx = raw?.context?.context;
  if (!ctx || typeof (ctx as Record<string, unknown>).drawArrays !== 'function') return null;
  return ctx as GlDrawCallContext;
}

function managedTextureCount(renderer: import('pixi.js').Renderer): number {
  const texture = (renderer as unknown as { texture?: { managedTextures?: readonly unknown[] } }).texture;
  return texture?.managedTextures?.length ?? 0;
}

function heapSizeMb(): number | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
  return typeof mem?.usedJSHeapSize === 'number' ? mem.usedJSHeapSize / 1048576 : null;
}