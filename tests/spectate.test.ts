import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { makeTestMap } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { WatchPromptDialog } from '../src/ui/overlays/WatchPromptDialog';
import { type UIHost } from '../src/ui/host';

const originalSim = (gameController as unknown as { sim: unknown }).sim;

afterEach(() => {
  (gameController as unknown as { sim: unknown }).sim = originalSim;
  useGameStore.getState().setWatching(false);
  useGameStore.getState().setOverlay(null);
});

describe('spectate reveal', () => {
  it('revealMapForLocal explores every tile and all tribes', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    players[0]!.knownTribes = [];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ netMode: 'single', localPlayerIndex: 0 });
    (gameController as unknown as { revealMapForLocal(): void }).revealMapForLocal();
    const anyTile = map.tiles.find((t) => !(t.exploredBy ?? []).includes(0));
    expect(anyTile).toBeUndefined();
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });
});

describe('WatchPromptDialog', () => {
  it('shows Watch and Finish buttons', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0, mode: 'capture' });
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => ({ measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }), width: 0, height: 0 }) }),
    };
    const host = { app: { screen: { width: 1280, height: 800 } }, overlayLayer: new Container() } as unknown as UIHost;
    const root = new Container();
    const d = new WatchPromptDialog();
    d.mount(host, root);
    const texts: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) texts.push(String((ch as Text).text));
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(root);
    d.destroy();
    expect(texts.some((t) => t.includes('WATCH'))).toBe(true);
    expect(texts.some((t) => t.includes('FINISH'))).toBe(true);
  });
});