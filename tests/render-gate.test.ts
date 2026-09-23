import { describe, it, expect } from 'vitest';
import { RenderGate } from '../src/render/render-gate';
import type { RenderGateApp } from '../src/render/render-gate';

type TickCb = (t: { deltaMS: number }) => void;

function fakeTicker() {
  const cbs: TickCb[] = [];
  return {
    cbs,
    add(fn: TickCb): unknown {
      cbs.push(fn);
      return fn;
    },
    remove(fn: TickCb): void {
      const i = cbs.indexOf(fn);
      if (i >= 0) cbs.splice(i, 1);
    },
    step(ms: number): void {
      for (const cb of [...cbs]) cb({ deltaMS: ms });
    },
  };
}

function fakeApp(): RenderGateApp & { ticker: ReturnType<typeof fakeTicker>; renders: number[]; canvasEvents: Record<string, (e?: unknown) => void> } {
  const ticker = fakeTicker();
  const canvasEvents: Record<string, (e?: unknown) => void> = {};
  const renders: number[] = [];
  return {
    ticker,
    canvas: {
      addEventListener: (type: string, cb: (e: unknown) => void) => {
        canvasEvents[type] = cb;
      },
    },
    canvasEvents,
    renders,
    render: () => {
      renders.push(renders.length + 1);
    },
  };
}

describe('RenderGate', () => {
  it('replaces the app render listener with a gated one that renders the first frame', () => {
    const app = fakeApp();
    app.ticker.add(app.render);
    RenderGate.install(app);
    expect(app.ticker.cbs).toHaveLength(1);
    expect(app.renders).toHaveLength(0);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
  });

  it('skips rendering entirely once idle', () => {
    const app = fakeApp();
    const gate = RenderGate.install(app);
    app.ticker.step(16); // initial dirty frame
    expect(app.renders).toHaveLength(1);
    app.ticker.step(16);
    app.ticker.step(16);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
    gate.destroy();
  });

  it('renders every tick while a transient animation listener is registered', () => {
    const app = fakeApp();
    RenderGate.install(app);
    app.ticker.step(16); // initial frame
    app.renders.length = 0;
    const anim = () => {};
    app.ticker.add(anim);
    app.ticker.step(16);
    app.ticker.step(16);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(3);
    app.ticker.remove(anim);
  });

  it('flushes one final frame after the last listener deregisters, then goes quiet', () => {
    const app = fakeApp();
    RenderGate.install(app);
    app.ticker.step(16);
    app.renders.length = 0;
    const anim = () => {};
    app.ticker.add(anim);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
    app.ticker.remove(anim);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(2); // flush frame
    app.ticker.step(16);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(2);
  });

  it('markDirty provokes exactly one frame', () => {
    const app = fakeApp();
    const gate = RenderGate.install(app);
    app.ticker.step(16);
    app.renders.length = 0;
    gate.markDirty();
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
    app.ticker.step(16);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
    gate.destroy();
  });

  it('ignored listeners do not keep rendering alive', () => {
    const app = fakeApp();
    const gate = RenderGate.install(app);
    app.ticker.step(16);
    app.renders.length = 0;
    const secret = () => {};
    gate.ignore(secret);
    app.ticker.add(secret);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(0);
    app.ticker.remove(secret);
    gate.destroy();
  });

  it('canvas interaction events mark the frame dirty', () => {
    const app = fakeApp();
    RenderGate.install(app);
    app.ticker.step(16);
    app.renders.length = 0;
    app.canvasEvents.pointermove?.();
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
    app.ticker.step(16);
    app.ticker.step(16);
    expect(app.renders).toHaveLength(1);
  });

  it('keyboard navigation (keydown) marks the frame dirty', () => {
    const keys: Array<() => void> = [];
    const orig = (window as unknown as { addEventListener?: unknown }).addEventListener;
    (window as unknown as { addEventListener?: unknown }).addEventListener = ((t: string, cb: () => void): void => {
      if (t === 'keydown') keys.push(cb);
    }) as typeof window.addEventListener;
    try {
      const app = fakeApp();
      RenderGate.install(app);
      app.ticker.step(16);
      app.renders.length = 0;
      keys.splice(0).forEach((cb) => cb());
      app.ticker.step(16);
      expect(app.renders).toHaveLength(1);
      app.ticker.step(16);
      app.ticker.step(16);
      expect(app.renders).toHaveLength(1);
    } finally {
      (window as unknown as { addEventListener?: unknown }).addEventListener = orig;
    }
  });

  it('invokes the app render with the app as `this`', () => {
    const ticker = fakeTicker();
    const calls: string[] = [];
    const app = {
      ticker,
      canvas: { addEventListener: () => {} },
      render(): void {
        calls.push(this === app ? 'bound' : 'lost');
      },
    };
    RenderGate.install(app as unknown as RenderGateApp);
    ticker.step(16);
    expect(calls).toEqual(['bound']);
  });
});