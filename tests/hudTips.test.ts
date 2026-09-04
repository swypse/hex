import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { useGameStore } from '../src/store/gameStore';
import { HudTips } from '../src/ui/hud/HudTips';
import { TIP_TEXTS } from '../src/ui/hud/tips';
import { storageService } from '../src/storage/storageService';
import { type UIHost } from '../src/ui/host';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function makeHost(width = 1280, height = 800): UIHost {
  return {
    app: { screen: { width, height } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudTips', () => {
  let host: UIHost;
  let root: Container;
  let tips: HudTips | null = null;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    host = makeHost();
    root = new Container();
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      localPlayerIndex: 0,
      gameOver: false,
      texturesLoading: false,
    });
  });

  afterEach(() => {
    tips?.destroy();
    tips = null;
    vi.restoreAllMocks();
  });

  function startGame(turn: number, current = 0): void {
    useGameStore.setState({
      screen: 'game',
      players: buildPlayers(Tribe.Cats, 1, new SeededRandom(1)),
      localPlayerIndex: 0,
      currentPlayerIndex: current,
      turn,
      gameOver: false,
      texturesLoading: false,
    });
  }

  const box = (): Container => (tips as unknown as { el: Container }).el!;
  const textOf = (): string => (tips as unknown as { text: { text: string } }).text!.text;
  const closeBox = (): void => {
    (tips as unknown as { cross: { emit: (event: string) => void } }).cross.emit('pointertap');
  };

  it('shows nothing before turn 3', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    expect(box().visible).toBe(false);
  });

  it('shows a tip on the local turn once the game reaches turn 3', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    expect(box().visible).toBe(true);
    expect(TIP_TEXTS).toContain(textOf());
  });

  it('stays visible across another player\'s turn until it is closed', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    const first = textOf();
    startGame(3, 1);
    expect(box().visible).toBe(true);
    expect(textOf()).toBe(first);
    startGame(3, 0);
    expect(box().visible).toBe(true);
    expect(textOf()).toBe(first);
  });

  it('closing hides the tip and the next one waits two more turns', () => {
    startGame(1);
    tips = new HudTips();
    tips.mount(host, root);
    startGame(3);
    const first = textOf();
    closeBox();
    expect(box().visible).toBe(false);
    startGame(4);
    expect(box().visible).toBe(false);
    startGame(5);
    expect(box().visible).toBe(true);
    expect(textOf()).not.toBe(first);
  });

  it('shows nothing when tips are disabled in settings', () => {
    vi.spyOn(storageService, 'getItem').mockReturnValue(
      JSON.stringify({ attackConfirmation: true, aiDifficulty: 'normal', disableTips: true }),
    );
    startGame(3);
    tips = new HudTips();
    tips.mount(host, root);
    expect(box().visible).toBe(false);
  });
});
