import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { UnitHelpDialog } from '../src/ui/overlays/UnitHelpDialog';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import type { GameMap } from '../src/game/mapGen';

type KeyboardEventLike = { key: string; preventDefault: () => void };

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

function makeHost(): UIHost {
  return {
    app: { screen: { width: 800, height: 600 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('UnitHelpDialog', () => {
  let keyHandler: ((e: KeyboardEventLike) => void) | null;
  let host: UIHost;
  let root: Container;
  let map: GameMap;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    map = makeTestMap(1);
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    tileAt(map, 0, 0)!.exploredBy = [0];
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    (gameController as unknown as { sim: Simulator | null }).sim = new Simulator(map, players, 'capture');
    useGameStore.setState({
      selection: { kind: 'unit', q: 0, r: 0 },
      players,
      localPlayerIndex: 0,
      overlay: { kind: 'unitHelp' },
    });

    host = makeHost();
    root = new Container();
  });

  afterEach(() => {
    (gameController as unknown as { sim: Simulator | null }).sim = null;
    useGameStore.setState({ overlay: null, selection: null, players: [] });
    vi.restoreAllMocks();
  });

  it('mounts a popup with the unit name and bullet lines', () => {
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const el = root.children[0] as Container;
    expect(el).toBeDefined();
    const card = el.children[1] as Container;
    // card background + title + close button + at least one bullet label
    expect(card.children.length).toBeGreaterThanOrEqual(4);
    dialog.destroy();
  });

  it('closes the overlay on Escape', () => {
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    expect(useGameStore.getState().overlay).toEqual({ kind: 'unitHelp' });
    keyHandler!({ key: 'Escape', preventDefault: () => {} });
    expect(useGameStore.getState().overlay).toBeNull();
    dialog.destroy();
  });

  it('closes the overlay when clicking outside the card', () => {
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const el = root.children[0] as Container;
    const backdrop = el.children[0] as { emit: (e: string) => void };
    backdrop.emit('pointertap');
    expect(useGameStore.getState().overlay).toBeNull();
    dialog.destroy();
  });

  it('mounts a settlement help popup', () => {
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false, name: 'Omega' };
    useGameStore.setState({ overlay: { kind: 'settlementHelp' } });
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const card = (root.children[0] as Container).children[1] as Container;
    expect(card.children.length).toBeGreaterThanOrEqual(4);
    dialog.destroy();
  });

  it('mounts a building help popup', () => {
    tileAt(map, 0, 0)!.settlement = null;
    tileAt(map, 0, 0)!.building = { kind: 'mine', level: 1 };
    useGameStore.setState({ overlay: { kind: 'buildingHelp' } });
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const card = (root.children[0] as Container).children[1] as Container;
    expect(card.children.length).toBeGreaterThanOrEqual(4);
    dialog.destroy();
  });

  it('mounts a building limits popup when an owned village is selected without a unit', () => {
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 2, captureReady: false, name: 'Omega' };
    useGameStore.setState({
      selection: { kind: 'village', q: 0, r: 0 },
      overlay: { kind: 'buildingLimitHelp' },
    });
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const card = (root.children[0] as Container).children[1] as Container;
    expect(card.children.length).toBeGreaterThanOrEqual(4);
    dialog.destroy();
  });

  it('opens a settlement popup for a village selection that has no unit', () => {
    tileAt(map, 0, 0)!.unit = null;
    tileAt(map, 0, 0)!.settlement = { owner: null, level: 1, captureReady: false };
    useGameStore.setState({
      selection: { kind: 'village', q: 0, r: 0 },
      overlay: { kind: 'settlementHelp' },
    });
    const dialog = new UnitHelpDialog();
    dialog.mount(host, root);
    const card = (root.children[0] as Container).children[1] as Container;
    expect(card.children.length).toBeGreaterThanOrEqual(4);
    dialog.destroy();
  });
});
