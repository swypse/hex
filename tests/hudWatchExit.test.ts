import { describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudWatchExit } from '../src/ui/hud/HudWatchExit';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(): UIHost {
  return { app: { screen: { width: 1280, height: 800 } }, overlayLayer: new Container() } as unknown as UIHost;
}

describe('HudWatchExit', () => {
  afterEach(() => {
    useGameStore.getState().setWatching(false);
  });

  it('is visible only while watching and not game over', () => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => ({ measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }), width: 0, height: 0 }) }),
    };
    const host = makeHost();
    const root = new Container();
    const w = new HudWatchExit();
    w.mount(host, root);
    useGameStore.setState({ screen: 'game', watching: false, gameOver: false });
    expect(w.elVisible()).toBe(false);
    useGameStore.setState({ watching: true, gameOver: false });
    expect(w.elVisible()).toBe(true);
    useGameStore.setState({ watching: true, gameOver: true });
    expect(w.elVisible()).toBe(false);
    w.destroy();
  });
});