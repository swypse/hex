import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { LobbyScreen } from '../src/ui/screens/LobbyScreen';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({
      width: s.length * 8,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: s.length * 8,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 3,
    }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('LobbyScreen resize handling', () => {
  let screen: LobbyScreen;
  let host: ReturnType<typeof makeHost>;
  const originalAdd = window.addEventListener;
  const originalRemove = window.removeEventListener;
  const handlers: Record<string, Array<(e?: unknown) => void>> = {};

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
      activeElement: null,
    };
    (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = class {};
    for (const k of Object.keys(handlers)) delete handlers[k];
    window.addEventListener = ((t: string, cb: (e?: unknown) => void) => {
      (handlers[t] ??= []).push(cb);
    }) as typeof window.addEventListener;
    window.removeEventListener = (() => {}) as typeof window.removeEventListener;
    host = makeHost();
    screen = new LobbyScreen();
    screen.mount(host);
    useGameStore.setState({ screen: 'lobby', lobby: null });
  });

  afterEach(() => {
    screen.destroy();
    window.addEventListener = originalAdd;
    window.removeEventListener = originalRemove;
    vi.restoreAllMocks();
  });

  const fireResize = (): void => {
    for (const cb of handlers['resize'] ?? []) cb();
  };

  it('does not re-render when only the height changes (soft keyboard)', () => {
    const renderSpy = vi.spyOn(screen as unknown as { render: () => void }, 'render');
    host.app.screen.height = 400;
    fireResize();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  it('re-renders when the width changes', () => {
    const renderSpy = vi.spyOn(screen as unknown as { render: () => void }, 'render');
    host.app.screen.width = 1024;
    fireResize();
    expect(renderSpy).toHaveBeenCalledTimes(1);
  });
});
