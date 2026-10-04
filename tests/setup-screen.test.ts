import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, FillGradient, Graphics, Rectangle, RendererType, Text } from 'pixi.js';
import { SetupScreen } from '../src/ui/screens/setup-screen';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';
import { TRIBE_BG_DEPTH } from '../src/ui/screens/tribe-bg-shader';
import { Screen } from '@enums';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, ticker: { add: (): void => {}, remove: (): void => {} } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

type KeyEvent = { key: string; preventDefault: () => void };

describe('SetupScreen', () => {
  let screen: SetupScreen;
  let keyHandler: ((e: KeyEvent) => void) | null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    const fakeBounds = new Bounds();
    fakeBounds.addRect(new Rectangle(0, 0, 60, 14));
    Object.defineProperty(Text.prototype, 'bounds', { configurable: true, get: () => fakeBounds });
    keyHandler = null;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => ({
          measureText: (s: string) => ({ width: s.length * 8 }),
          createLinearGradient: () => ({ addColorStop: () => {} }),
          createRadialGradient: () => ({ addColorStop: () => {} }),
          fillRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        }),
        width: 0,
        height: 0,
      }),
    };
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyEvent) => void; };
    win.removeEventListener = () => {};
    screen = new SetupScreen();
    screen.mount(makeHost());
  });

  afterEach(() => {
    screen.destroy();
  });

  it('adds a back button', () => {
    expect((screen as unknown as { backBtn: unknown }).backBtn).toBeTruthy();
  });

  it('goes back to the start screen on backspace', () => {
    keyHandler!({ key: 'Backspace', preventDefault: () => {} });
    expect(useGameStore.getState().screen).toBe(Screen.START);
  });

  it('reaches the back button as the last selector and triggers it with Enter', () => {
    useGameStore.setState({ screen: Screen.SETUP });
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // enemies
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // mode
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // difficulty
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // start
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // back
    expect((screen as unknown as { selector: number }).selector).toBe(5);
    keyHandler!({ key: 'Enter', preventDefault: () => {} });
    expect(useGameStore.getState().screen).toBe(Screen.START);
  });

  it('highlights the start button as a selectable element before back', () => {
    const s = screen as unknown as { selector: number; startBtn: { selected: boolean } };
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} });
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} });
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} });
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // start
    expect(s.selector).toBe(4);
    expect(s.startBtn!.selected).toBe(true);
  });

  it('paints a full-screen tribe-tinted shader background at mount', () => {
    const s = screen as unknown as {
      bg: Graphics | null;
      bgShader: unknown;
      bgColor: number | null;
    };
    expect(s.bgColor).not.toBeNull();
    const bg = s.bg!;
    const bounds = bg.getLocalBounds();
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(800);
    // The custom gradient shader is attached to the background Graphics.
    expect(bg.context.customShader).not.toBeNull();
    expect(s.bgShader).not.toBeNull();
  });

  it('avoids the WebGL-only custom shader on a WebGPU renderer', () => {
    const host = makeHost();
    (host.app as { renderer?: { type: number } }).renderer = { type: RendererType.WEBGPU };
    const s = new SetupScreen();
    s.mount(host);
    const view = s as unknown as { bg: Graphics | null; bgShader: unknown; bgColor: number | null };
    expect(view.bgColor).not.toBeNull();
    // Without a GPU program the custom shader would make WebGPU crash reading
    // `shader.gpuProgram`; the WebGPU path must render without it.
    expect(view.bgShader).toBeNull();
    expect(view.bg!.context.customShader).toBeFalsy();
    s.destroy();
  });

  it('keeps the WebGPU gradient visually identical to the WebGL shader', () => {
    const host = makeHost();
    (host.app as { renderer?: { type: number } }).renderer = { type: RendererType.WEBGPU };
    const buildSpy = vi.spyOn(FillGradient.prototype, 'buildLinearGradient');
    const s = new SetupScreen();
    s.mount(host);
    expect(buildSpy).toHaveBeenCalled();
    const gradient = buildSpy.mock.instances[0] as unknown as FillGradient;
    // FillGradient local-space coordinates are normalized to the shape (0-1).
    // The GL shader blends tribe→bg down to `uDepth` (TRIBE_BG_DEPTH) then
    // holds solid bg; the gradient end must be the same normalized fraction.
    expect(gradient.start).toEqual({ x: 0, y: 0 });
    expect(gradient.end!.y).toBeCloseTo(TRIBE_BG_DEPTH);
    buildSpy.mockRestore();
    s.destroy();
  });

  it('starts a background cross-fade when the tribe changes by arrow keys', () => {
    const s = screen as unknown as {
      setTribe: (id: unknown) => void;
      bgTweenRemove: (() => void) | null;
      tribe: unknown;
      bgShader: { shader: { resources: { gradient: { uniforms: { uTopColor: Float32Array } } } }; setTop: (c: number) => void } | null;
    };
    const before = s.bgShader!.shader.resources.gradient.uniforms.uTopColor[0];
    s.setTribe('warriors');
    // A tween listener is registered while the fade runs.
    expect(s.bgTweenRemove).not.toBeNull();
    expect(s.tribe).toBe('warriors');
    // The tween immediately repaints the uniform from the previous tribe color.
    expect(s.bgShader!.shader.resources.gradient.uniforms.uTopColor[0]).toBe(before);
  });
});
