import { UPDATE_PRIORITY } from 'pixi.js';

/** Minimal surface of the Pixi `Application` the gate drives. */
export interface RenderGateApp {
  ticker: {
    add(fn: (t: unknown) => void, context?: unknown, priority?: number): unknown;
    remove(fn: (t: unknown) => void, context?: unknown): void;
  };
  render: () => void;
  canvas?: {
    addEventListener(type: string, listener: (e: unknown) => void, options?: unknown): void;
  };
}

/** Dirty-flag render gate: the app's per-frame render only runs when the frame
 *  has something to draw. Keeps everything else (ticker, animations, pointer
 *  events) running, so behaviour is identical — only `renderer.render` is
 *  skipped while the scene is provably static. */
export class RenderGate {
  /** Ticker listeners registered after install that are invisible bookkeeping
   *  (e.g. the FPS sampler) and must not keep frames alive. */
  private readonly ignored = new Set<(t: unknown) => void>();
  private active = 0;
  private dirty = true;
  private flush = false;
  private renderFn: (() => void) | null = null;
  private tickFn: ((t: unknown) => void) | null = null;
  private installed = false;
  private ticker: RenderGateApp['ticker'] | null = null;
  private origAdd: RenderGateApp['ticker']['add'] | null = null;
  private origRemove: RenderGateApp['ticker']['remove'] | null = null;
  private interaction: (() => void) | null = null;

  static install(app: RenderGateApp): RenderGate {
    const gate = new RenderGate();
    gate.arm(app);
    return gate;
  }

  private constructor() {}

  private arm(app: RenderGateApp): void {
    if (this.installed) return;
    this.installed = true;
    // `app.render` is an unbound prototype method; capture it bound to the app
    // so our gated listener can call it without a receiver.
    this.renderFn = app.render.bind(app) as () => void;
    this.ticker = app.ticker;

    const ticker = app.ticker;
    // Drop Pixi's built-in per-frame render listener (TickerPlugin added
    // `ticker.add(app.render, app, UPDATE_PRIORITY.LOW)`).
    ticker.remove(app.render as (t: unknown) => void, app as unknown);
    // Register our own gated render BEFORE wrapping add/remove so it is never
    // counted as an active animation.
    this.tickFn = () => this.tick();
    ticker.add(this.tickFn, this, UPDATE_PRIORITY.LOW);

    // Count every listener registered from here on (all per-frame animations
    // in the game are transient ticker listeners: fire, sparks, pulses, …).
    this.origAdd = ticker.add.bind(ticker);
    this.origRemove = ticker.remove.bind(ticker);
    ticker.add = ((fn: (t: unknown) => void, context?: unknown, priority?: number) => {
      if (!this.ignored.has(fn)) this.active++;
      return this.origAdd!(fn, context, priority);
    }) as RenderGateApp['ticker']['add'];
    ticker.remove = ((fn: (t: unknown) => void, context?: unknown) => {
      if (!this.ignored.has(fn)) this.active = Math.max(0, this.active - 1);
      this.flush = true;
      return this.origRemove!(fn, context);
    }) as RenderGateApp['ticker']['remove'];

    // Any interaction provokes at least one frame (hover states, tooltips, …).
    this.interaction = (): void => {
      this.markDirty();
    };
    app.canvas?.addEventListener('pointerdown', this.interaction);
    app.canvas?.addEventListener('pointermove', this.interaction);
    app.canvas?.addEventListener('pointerup', this.interaction);
    app.canvas?.addEventListener('pointercancel', this.interaction);
    app.canvas?.addEventListener('wheel', this.interaction);
    // Keyboard navigation (menu arrows, dialog Escape/Enter) changes visuals
    // without touching the canvas; render a frame on any key press.
    (globalThis as { window?: { addEventListener?: (t: string, cb: unknown) => void } }).window?.addEventListener?.(
      'keydown',
      this.interaction,
    );
  }

  /** Requests one render on the next tick (state change, camera move, resize). */
  markDirty(): void {
    this.dirty = true;
  }

  /** Exclude a ticker listener from the active count (call before registering). */
  ignore(fn: (t: unknown) => void): void {
    this.ignored.add(fn);
  }

  /** Reverts the ticker wrapping and event hooks (tests / teardown). */
  destroy(): void {
    if (!this.installed) return;
    this.installed = false;
    const { ticker, tickFn } = this;
    if (this.origAdd) ticker!.add = this.origAdd;
    if (this.origRemove) ticker!.remove = this.origRemove;
    if (tickFn) ticker!.remove(tickFn, this);
    this.tickFn = null;
    this.renderFn = null;
    this.ticker = null;
    this.origAdd = null;
    this.origRemove = null;
    this.interaction = null;
  }

  private tick(): void {
    const render = this.renderFn;
    if (!render) return;
    // A listener deregistered: paint one final frame so the cleared state shows.
    if (this.flush) {
      this.flush = false;
      this.dirty = false;
      render();
      return;
    }
    // A per-frame animation is running.
    if (this.active > 0) {
      this.dirty = false;
      render();
      return;
    }
    // Something explicitly asked for a frame.
    if (this.dirty) {
      this.dirty = false;
      render();
    }
  }
}

let gate: RenderGate | null = null;

/** Installs the process-wide gate and returns it for tests. Re-installing is a
 *  no-op. */
export function installRenderGate(app: RenderGateApp): RenderGate {
  return (gate ??= RenderGate.install(app));
}

/** Requests one render on the next tick from anywhere. Safe before install. */
export function markDirty(): void {
  gate?.markDirty();
}

/** Exclude a ticker listener from keeping frames alive (e.g. the FPS sampler).
 *  Safe before install. */
export function ignoreTickerListener(fn: (t: unknown) => void): void {
  gate?.ignore(fn);
}