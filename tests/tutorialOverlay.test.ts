import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { useGameStore } from '../src/store/gameStore';
import { TutorialOverlay } from '../src/ui/overlays/TutorialOverlay';
import { type UIHost } from '../src/ui/host';
import { buildTutorialPlayers } from '../src/game/tutorial/tutorialMap';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('TutorialOverlay', () => {
  let root: Container;
  let overlay: TutorialOverlay | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    root = new Container();
    useGameStore.setState({
      screen: 'game',
      tutorial: true,
      tutorialStep: 'moveUnit',
      tutorialHighlightSkills: [],
      tutorialHighlightEndTurn: false,
      texturesLoading: false,
      players: buildTutorialPlayers(),
      localPlayerIndex: 0,
      gameOver: false,
    });
  });

  afterEach(() => {
    overlay?.destroy();
    overlay = null;
  });

  it('mounts a visible banner container while an objective step is active', () => {
    overlay = new TutorialOverlay();
    overlay.mount(makeHost(), root);
    expect(root.children.length).toBeGreaterThan(0);
    const el = (overlay as unknown as { el: Container }).el;
    expect(el.visible).toBe(true);
  });

  it('hides while textures are loading', () => {
    useGameStore.setState({ texturesLoading: true });
    overlay = new TutorialOverlay();
    overlay.mount(makeHost(), root);
    const el = (overlay as unknown as { el: Container }).el;
    expect(el.visible).toBe(false);
  });
});
