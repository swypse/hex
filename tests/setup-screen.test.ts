import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Graphics, Rectangle, Text } from 'pixi.js';
import { SetupScreen } from '../src/ui/screens/setup-screen';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';
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

  const press = (key: string): void => keyHandler!({ key, preventDefault: () => {} });
  const view = (): { selector: number; startBtn: { selected: boolean } } =>
    screen as unknown as { selector: number; startBtn: { selected: boolean } };

  it('shows tribe and options together with start selected', () => {
    expect(view().startBtn.selected).toBe(true);
  });

  it('reaches the back button as the last selector and triggers it with Enter', () => {
    useGameStore.setState({ screen: Screen.SETUP });
    press('ArrowDown'); // back
    expect(view().selector).toBe(5);
    press('Enter');
    expect(useGameStore.getState().screen).toBe(Screen.START);
  });

  it('changes the tribe with arrows on the tribe row', () => {
    const s = screen as unknown as { tribe: unknown };
    const before = s.tribe;
    for (let i = 0; i < 4; i++) press('ArrowUp'); // start -> tribe row
    expect(view().selector).toBe(0);
    press('ArrowRight');
    expect(s.tribe).not.toBe(before);
  });

  it('paints a solid 20px tribe-colour strip along the top at mount', () => {
    const s = screen as unknown as { bg: Graphics | null; bgColor: number | null };
    expect(s.bgColor).not.toBeNull();
    const bounds = s.bg!.getLocalBounds();
    expect(bounds.width).toBe(1280);
    expect(bounds.height).toBe(20);
  });

  it('starts a strip cross-fade when the tribe changes by arrow keys', () => {
    const s = screen as unknown as { setTribe: (id: unknown) => void; bgTweenRemove: (() => void) | null; tribe: unknown };
    s.setTribe('warriors');
    // A tween listener is registered while the fade runs.
    expect(s.bgTweenRemove).not.toBeNull();
    expect(s.tribe).toBe('warriors');
  });
});
