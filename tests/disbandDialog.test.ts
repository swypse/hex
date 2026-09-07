import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { Simulator } from '../src/game/simulator';
import { generateMap } from '../src/game/mapGen';
import { buildPlayers } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { DisbandDialog } from '../src/ui/overlays/DisbandDialog';
import { makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import type { MapTile } from '../src/game/mapGen';

function fakeCanvasContext() {
  return {
    measureText: (s: string) => ({ width: s.length * 8, actualBoundingBoxLeft: 0, actualBoundingBoxRight: s.length * 8, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 }),
  };
}

function makeHost() {
  return { app: { screen: { width: 800, height: 600 } }, screenLayer: new Container(), overlayLayer: new Container() } as never;
}

function allTexts(c: Container): string[] {
  const out: string[] = [];
  const walk = (n: Container): void => {
    for (const ch of n.children) {
      if (ch instanceof Text) out.push(String((ch as Text).text));
      if (ch instanceof Container) walk(ch);
    }
  };
  walk(c);
  return out;
}

describe('DisbandDialog', () => {
  let unitTile: MapTile;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    const map = generateMap(2, 42);
    unitTile = map.tiles.find((t) => t.terrain !== TileType.Water && t.settlement === null && t.unit === null)!;
    unitTile.unit = makeUnit('u1', 0, 'warrior', unitTile.q, unitTile.r);
    const players = buildPlayers(0, 1, new SeededRandom(1));
    players[0]!.resources.money = 50;
    const sim = new Simulator(map, players, 'capture');
    sim.startGame();
    sim.drainEvents();
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.getState().setLocalPlayerIndex(0);
    useGameStore.getState().setPlayers(players);
    useGameStore.getState().setOverlay({ kind: 'disband', unitId: 'u1' });
    root = new Container();
  });

  afterEach(() => {
    useGameStore.setState({ players: [], overlay: null });
  });

  it('shows the unit name and the disband cost', () => {
    const dialog = new DisbandDialog();
    dialog.mount(makeHost(), root);
    const texts = allTexts(root.children[0] as Container);
    expect(texts.some((t) => t.includes('Disband Warrior'))).toBe(true);
    expect(texts.some((t) => t.includes('3'))).toBe(true);
    dialog.destroy();
  });

  it('cancels without disbanding when the cancel button is tapped', () => {
    const dialog = new DisbandDialog();
    dialog.mount(makeHost(), root);
    const popupRoot = root.children[0] as Container;
    const card = popupRoot.children[2] as Container;
    const footer = card.children[3] as Container;
    const cancel = footer.children[1]!;
    (cancel as unknown as { emit: (e: string) => void }).emit('pointertap');
    expect(useGameStore.getState().overlay).toBeNull();
    expect(unitTile.unit).not.toBeNull();
    dialog.destroy();
  });
});
