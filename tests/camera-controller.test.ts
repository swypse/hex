import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Rectangle } from 'pixi.js';
import { CameraController, type CameraContext } from '../src/controller/camera-controller';

function makeCamera(overrides: Partial<CameraContext> = {}): CameraController {
  const ctx: CameraContext = {
    app: null,
    hexSize: 40,
    screenWidth: () => 800,
    mapHeight: () => 600,
    mapRadius: () => 2,
    onCameraChange: () => {},
    ...overrides,
  };
  return new CameraController(ctx);
}

interface FakeTick {
  callbacks: Array<(t: { deltaMS: number }) => void>;
  add: (fn: (t: { deltaMS: number }) => void) => void;
  remove: (fn: (t: { deltaMS: number }) => void) => void;
  step: (ms: number) => void;
}

function fakeTicker(): FakeTick {
  const callbacks: Array<(t: { deltaMS: number }) => void> = [];
  return {
    callbacks,
    add: (fn: (t: { deltaMS: number }) => void): void => {
      callbacks.push(fn);
    },
    remove: (fn: (t: { deltaMS: number }) => void): void => {
      const i = callbacks.indexOf(fn);
      if (i >= 0) callbacks.splice(i, 1);
    },
    step: (ms: number): void => {
      for (const cb of [...callbacks]) cb({ deltaMS: ms });
    },
  };
}

interface FakeApp {
  screen: { width: number; height: number };
  ticker: FakeTick;
  canvas: { setPointerCapture: () => void };
}

function makeApp(): FakeApp {
  const ticker = fakeTicker();
  return {
    screen: { width: 800, height: 600 },
    ticker,
    canvas: { setPointerCapture: () => {} },
  };
}

function fakeWindow() {
  const handlers = new Map<string, Array<(e: Record<string, number>) => void>>();
  return {
    handlers,
    addEventListener: (t: string, cb: unknown): void => {
      const list = handlers.get(t) ?? [];
      list.push(cb as (e: Record<string, number>) => void);
      handlers.set(t, list);
    },
    removeEventListener: (t: string, cb: unknown): void => {
      const list = handlers.get(t) ?? [];
      handlers.set(t, list.filter((h) => h !== cb));
    },
  };
}

describe('CameraController.viewportRect', () => {
  it('covers the whole visible screen in container-local coordinates', () => {
    const cam = makeCamera();
    cam.baseScale = 2;
    cam.zoom = 1;
    cam.pan = { x: 100, y: 50 };
    const r = cam.viewportRect();
    expect(r).toEqual(new Rectangle(-100 / 2, -50 / 2, 800 / 2, 600 / 2));
  });

  it('scales with zoom so empty space around a zoomed-out map stays draggable', () => {
    const cam = makeCamera();
    cam.baseScale = 1;
    cam.zoom = 0.5;
    cam.pan = { x: 400, y: 300 };
    const r = cam.viewportRect();
    expect(r).toEqual(new Rectangle(-400 / 0.5, -300 / 0.5, 800 / 0.5, 600 / 0.5));
  });
});

describe('CameraController interaction busy state', () => {
  let win: ReturnType<typeof fakeWindow>;
  let origNow: () => number;
  let now: number;

  beforeEach(() => {
    win = fakeWindow();
    (globalThis as { window: unknown }).window = win as unknown as Window;
    origNow = performance.now;
    now = 0;
    (performance as { now: () => number }).now = () => now;
  });

  afterEach(() => {
    (performance as { now: () => number }).now = origNow;
    (globalThis as { window: unknown }).window = window;
  });

  function move(clientX: number, clientY: number): void {
    for (const h of win.handlers.get('pointermove') ?? []) h({ pointerId: 1, clientX, clientY });
  }

  function up(): void {
    for (const h of win.handlers.get('pointerup') ?? []) h({ pointerId: 1 });
  }

  it('is idle initially, busy while dragging, and idle again on release', () => {
    const cam = makeCamera({ app: makeApp() as unknown as Application });
    try {
      expect(cam.isBusy).toBe(false);
      cam.handlePointerDown(1, { x: 100, y: 100 });
      move(102, 100); // still under the drag threshold
      expect(cam.isBusy).toBe(false);
      now = 100;
      move(110, 100); // past the threshold
      expect(cam.isBusy).toBe(true);
      now = 1000;
      up(); // slow release -> no inertia
      expect(cam.isBusy).toBe(false);
    } finally {
      cam.destroy();
    }
  });

  it('reports busy while wheel zoom is easing and idle once it settles', () => {
    const busy: boolean[] = [];
    const app = makeApp();
    const cam = makeCamera({ app: app as unknown as Application, onBusyChange: (b) => busy.push(b) });
    try {
      cam.baseScale = 1;
      cam.zoom = 1;
      cam.pan = { x: 0, y: 0 };
      cam.handleWheel(-1, { x: 0, y: 0 });
      expect(cam.isBusy).toBe(true);
      app.ticker.step(16);
      expect(cam.zoom).toBeGreaterThan(1);
      for (let i = 0; i < 240; i++) app.ticker.step(16);
      expect(cam.zoom).toBeCloseTo(1.5625, 3);
      expect(cam.isBusy).toBe(false);
      expect(busy).toEqual([true, false]);
    } finally {
      cam.destroy();
    }
  });

  it('eases the pan toward the drag target across ticker frames instead of snapping instantly', () => {
    const app = makeApp();
    const cam = makeCamera({ app: app as unknown as Application });
    try {
      cam.baseScale = 1;
      cam.zoom = 1;
      cam.pan = { x: 100, y: 100 };
      cam.handlePointerDown(1, { x: 0, y: 0 });
      now = 500;
      move(250, 110); // past the threshold -> drag activates, target = pan start
      move(350, 130); // move the pointer; the drag target becomes (200, 120)
      // The pan does not jump to the target on the pointermove itself.
      expect(cam.pan.x).toBe(100);
      expect(cam.pan.y).toBe(100);
      app.ticker.step(16);
      expect(cam.pan.x).toBeGreaterThan(100);
      expect(cam.pan.x).toBeLessThan(200);
      expect(cam.pan.y).toBeGreaterThan(100);
      expect(cam.pan.y).toBeLessThan(120);
      for (let i = 0; i < 400; i++) app.ticker.step(16);
      // Converged to the clamped drag target while still dragging.
      expect(cam.pan.x).toBeCloseTo(200, 0);
      expect(cam.pan.y).toBeCloseTo(120, 0);
      expect(cam.isBusy).toBe(true);
      up();
    } finally {
      cam.destroy();
    }
  });

  it('zooms out toward the wheel target under the cursor and stops on a new wheel event', () => {
    const app = makeApp();
    const cam = makeCamera({ app: app as unknown as Application });
    try {
      cam.baseScale = 1;
      cam.zoom = 1.2;
      cam.pan = { x: 40, y: 0 };
      cam.handleWheel(1, { x: 0, y: 0 }); // zoom out: target ~1.0909
      app.ticker.step(16);
      expect(cam.zoom).toBeLessThan(1.2);
      const before = cam.zoom;
      cam.handleWheel(-1, { x: 0, y: 0 }); // new wheel -> restart toward 1.2
      app.ticker.step(16);
      expect(cam.zoom).toBeGreaterThan(before);
      cam.destroy();
    } finally {
      cam.destroy();
    }
  });
});

describe('CameraController.applyFitToScreen zoom cap', () => {
  it('caps maxZoom so baked texture pixels are never upscaled past native size', () => {
    const origWindow = (globalThis as { window: unknown }).window;
    (globalThis as { window: unknown }).window = { devicePixelRatio: 1 } as unknown as Window;
    try {
      // Wide screen so narrowBoost is 1; radius chosen so fit*START_ZOOM lands
      // where qualityFactor clamps at QUALITY_CAP (4) and the cap actually binds.
      const cam = makeCamera({
        screenWidth: () => 1920,
        mapHeight: () => 1080,
        mapRadius: () => 9,
      });
      cam.applyFitToScreen();
      const cap = cam.qualityFactor / cam.baseScale;
      expect(cam.maxZoom).toBeCloseTo(cap);
      expect(cam.maxZoom).toBeLessThan(3);
      expect(cam.baseScale * cam.maxZoom).toBeCloseTo(cam.qualityFactor);
    } finally {
      (globalThis as { window: unknown }).window = origWindow;
    }
  });

  it('keeps the default fit view (zoom 1) reachable even when the cap would bind below it', () => {
    const origWindow = (globalThis as { window: unknown }).window;
    (globalThis as { window: unknown }).window = { devicePixelRatio: 1 } as unknown as Window;
    try {
      const cam = makeCamera({
        screenWidth: () => 1920,
        mapHeight: () => 1080,
        mapRadius: () => 40,
      });
      cam.applyFitToScreen();
      expect(cam.maxZoom).toBeGreaterThanOrEqual(1);
    } finally {
      (globalThis as { window: unknown }).window = origWindow;
    }
  });
});