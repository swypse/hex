import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Bounds, Container, Rectangle, Text } from 'pixi.js';
import { SetupScreen } from '../src/ui/screens/SetupScreen';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 } },
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
    keyHandler!({ key: 'ArrowDown', preventDefault: () => {} }); // back
    expect((screen as unknown as { selector: number }).selector).toBe(4);
    keyHandler!({ key: 'Enter', preventDefault: () => {} });
    expect(useGameStore.getState().screen).toBe('start');
  });
});
