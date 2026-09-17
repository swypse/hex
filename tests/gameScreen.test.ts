import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application, Container, BitmapText, Graphics } from 'pixi.js';
import { GameScreen } from '../src/ui/screens/GameScreen';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(): UIHost {
  const app = {
    screen: { width: 1280, height: 800 },
    stage: new Container(),
    ticker: { add: (): void => {}, remove: (): void => {} },
  } as unknown as Application;
  return {
    app,
    screenLayer: new Container(),
    overlayLayer: new Container(),
  };
}

function makeNarrowHost(): UIHost {
  const app = {
    screen: { width: 400, height: 800 },
    stage: new Container(),
    ticker: { add: (): void => {}, remove: (): void => {} },
  } as unknown as Application;
  return {
    app,
    screenLayer: new Container(),
    overlayLayer: new Container(),
  };
}

function findTextOwner(c: Container, text: string): Container | null {
  for (const ch of c.children) {
    if (ch instanceof BitmapText && (ch as BitmapText).text === text) return c;
    if (ch instanceof Container) {
      const found = findTextOwner(ch as Container, text);
      if (found) return found;
    }
  }
  return null;
}

describe('GameScreen lifecycle', () => {
  beforeEach(() => {
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => ({ measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }), width: 0, height: 0 }) }),
    };
    useGameStore.setState({ screen: 'start', texturesLoading: false });
    gameController.shutdown();
  });

  afterEach(() => {
    gameController.shutdown();
    useGameStore.setState({ screen: 'start', texturesLoading: false });
    vi.restoreAllMocks();
  });

  it('shuts down the game controller when the screen is destroyed', () => {
    const host = makeHost();
    const screen = new GameScreen();
    screen.mount(host);
    const spy = vi.spyOn(gameController, 'shutdown');
    screen.destroy();
    expect(spy).toHaveBeenCalled();
  });

  it('hides the map and hud content and shows only Loading while textures load', () => {
    const host = makeHost();
    const screen = new GameScreen();
    screen.mount(host);
    const root = host.screenLayer.children[0] as Container;
    const mapLayer = root.children[0] as Container;
    const hud = root.children[1] as Container;
    const content = hud.children[0] as Container;

    useGameStore.setState({ screen: 'game', texturesLoading: true });
    expect(mapLayer.visible).toBe(false);
    expect(content.visible).toBe(false);
    const loadingOwner = findTextOwner(hud, 'Loading...');
    expect(loadingOwner).toBeDefined();
    expect(loadingOwner!.visible).toBe(true);

    useGameStore.setState({ texturesLoading: false });
    expect(mapLayer.visible).toBe(true);
    expect(content.visible).toBe(true);
    expect(loadingOwner!.visible).toBe(false);

    screen.destroy();
  });

  it('renders the map full height under the toolbar on narrow screens', () => {
    const host = makeNarrowHost();
    const screen = new GameScreen();
    screen.mount(host);
    const root = host.screenLayer.children[0] as Container;
    const mapLayer = root.children[0] as Container;
    const mask = mapLayer.mask as Graphics;
    const nested = mask.context.instructions.flatMap((i) => {
      const path = (i.data as { path?: { instructions: Array<{ action: string; data: unknown }> } })?.path;
      return path ? path.instructions : [];
    });
    const rect = nested.find((p) => p.action === 'rect') as { data: number[] } | undefined;
    // On a 400px-wide screen the map still covers the full 800px height,
    // extending beneath the toolbar exactly like wide screens.
    expect(rect).toBeDefined();
    expect(rect!.data[3]).toBe(800);
    screen.destroy();
  });
});
