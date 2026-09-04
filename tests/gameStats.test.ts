import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { GameStats } from '../src/ui/overlays/GameStats';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { TRIBES, Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

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

describe('GameStats unknown tribes', () => {
  let stats: GameStats;
  let root: Container;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  afterEach(() => {
    stats.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const mount = (map: ReturnType<typeof makeTestMap>): { enemyName: string } => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyName = TRIBES.find((t) => t.id === players[1]!.tribe)!.name;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    stats = new GameStats();
    stats.mount(makeHost(), root);
    return { enemyName };
  };

  const mountWithKnown = (): { enemyName: string } => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    const enemyName = TRIBES.find((t) => t.id === players[1]!.tribe)!.name;
    players[0]!.knownTribes = [Tribe.Villagers, players[1]!.tribe];
    const sim = new Simulator(makeTestMap(), players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    stats = new GameStats();
    stats.mount(makeHost(), root);
    return { enemyName };
  };

  const renderedTexts = (): string[] => {
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) out.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(root);
    return out;
  };

  it('shows "Unknown tribe" while the enemy tribe is undiscovered', () => {
    const map = makeTestMap();
    const tile = tileAt(map, 1, 0)!;
    tile.exploredBy = [1];
    tile.unit = makeUnit('u1', 1, 'warrior', 1, 0);
    mount(map);
    expect(renderedTexts().some((s) => s.includes('Unknown tribe'))).toBe(true);
  });

  it('shows the tribe name once discovered', () => {
    const { enemyName } = mountWithKnown();
    expect(renderedTexts().some((s) => s.includes(enemyName))).toBe(true);
    expect(renderedTexts().some((s) => s.includes('Unknown tribe'))).toBe(false);
  });
});
