import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { SpawnDialog } from '../src/ui/overlays/SpawnDialog';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';
import { makeTestMap } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { axialKey } from '../src/game/hex';

type KeyboardEventLike = { key: string; preventDefault: () => void };

function makeHost(): UIHost {
  return {
    app: { screen: { width: 800, height: 600 } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('SpawnDialog', () => {
  let keyHandler: ((e: KeyboardEventLike) => void) | null;
  let host: UIHost;
  let root: Container;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    keyHandler = null;
    const win = (globalThis as { window: { addEventListener: (t: string, cb: unknown) => void; removeEventListener: (t: string, cb: unknown) => void } }).window;
    win.addEventListener = (t, cb) => { if (t === 'keydown') keyHandler = cb as (e: KeyboardEventLike) => void; };
    win.removeEventListener = () => {};

    const map = makeTestMap(1);
    const village = map.tiles.find((t) => axialKey(t) === '0,0')!;
    village.settlement = { owner: 0, level: 1, captureReady: false };
    const players = buildPlayers(Tribe.Cats, 1, new SeededRandom(1));
    (gameController as unknown as { sim: Simulator | null }).sim = new Simulator(map, players, 'capture');
    useGameStore.setState({
      selection: { kind: 'village', q: 0, r: 0 },
      players,
      localPlayerIndex: 0,
      overlay: { kind: 'spawn' },
    });

    host = makeHost();
    root = new Container();
  });

  afterEach(() => {
    (gameController as unknown as { sim: Simulator | null }).sim = null;
    useGameStore.setState({ overlay: null, selection: null, players: [] });
    vi.restoreAllMocks();
  });

  it('closes the dialog when Escape is pressed', () => {
    const dialog = new SpawnDialog();
    dialog.mount(host, root);
    expect(useGameStore.getState().overlay).toEqual({ kind: 'spawn' });
    keyHandler!({ key: 'Escape', preventDefault: () => {} });
    expect(useGameStore.getState().overlay).toBeNull();
    dialog.destroy();
  });
});
