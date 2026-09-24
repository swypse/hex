import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bounds, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { SetupScreen } from '../src/ui/screens/setup-screen';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';

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
    expect(useGameStore.getState().screen).toBe('start');
  });

  it('reaches the back button as the last selector and triggers it with Enter', () => {
    useGameStore.setState({ screen: 'setup' });
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // enemies
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // mode
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // difficulty
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // start
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // back
    expect((screen as unknown as { selector: number }).selector).toBe(5);
    keyHandler!({ key: 'Enter', preventDefault: () => {} });
    expect(useGameStore.getState().screen).toBe('start');
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
