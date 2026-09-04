import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { GameOver, placeColor } from '../src/ui/overlays/GameOver';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

describe('GameOver placeColor', () => {
  it('uses gold, silver, bronze, gray for places 1-4', () => {
    expect(placeColor(1)).toBe(0xffd700);
    expect(placeColor(2)).toBe(0xc0c0c0);
    expect(placeColor(3)).toBe(0xcd7f32);
    expect(placeColor(4)).toBe(0x888888);
  });
});

describe('GameOver screen', () => {
  let screen: GameOver;
  let root: Container;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const mount = (): Container => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    players[0]!.score = 100;
    players[1]!.score = 50;
    players[2]!.score = 10;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({
      screen: 'game', players, localPlayerIndex: 0, winnerIndex: 0, mode: 'capture', bonusAwarded: false, turn: 27,
    });
    root = new Container();
    screen = new GameOver();
    screen.mount(makeHost(), root);
    return root;
  };

  afterEach(() => {
    if (screen) screen.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const allTexts = (r: Container): string[] => {
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  const clickIcon = (r: Container, index: number): void => {
    const interactives: Container[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if ((ch as Container).eventMode === 'static') interactives.push(ch as Container);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    interactives[index]!.emit('pointertap', {} as never);
  };

  it('selects the current player by default and shows their name', () => {
    const r = mount();
    const texts = allTexts(r);
    const localName = useGameStore.getState().players[0]!.name;
    expect(texts.some((t) => t.includes(localName))).toBe(true);
  });

  it('shows place badges 1, 2, 3', () => {
    const r = mount();
    const texts = allTexts(r);
    expect(texts.includes('1')).toBe(true);
    expect(texts.includes('2')).toBe(true);
    expect(texts.includes('3')).toBe(true);
  });

  it('shows the game turn count', () => {
    const r = mount();
    expect(allTexts(r).some((t) => t.includes('Turns: 27'))).toBe(true);
  });

  it('switches details when another tribe icon is selected', () => {
    const r = mount();
    const other = useGameStore.getState().players[1]!.name;
    expect(allTexts(r).some((t) => t.includes(other))).toBe(false);
    clickIcon(r, 1);
    expect(allTexts(r).some((t) => t.includes(other))).toBe(true);
  });
});
