import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Container, Sprite, Text } from 'pixi.js';
import { SpawnDialog, spawnableTypesFor } from '../src/ui/overlays/spawn-dialog';
import { gameController } from '../src/controller/game-controller';
import { useGameStore } from '../src/store/game-store';
import { type UIHost } from '../src/ui/host';
import { makeTestMap } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { axialKey } from '../src/game/hex';
import { UNIT_TYPES, type UnitType } from '../src/game/units';

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
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        getContext: () => ({
          measureText: (s: string) => ({
            width: s.length * 8,
            actualBoundingBoxLeft: 0,
            actualBoundingBoxRight: s.length * 8,
            actualBoundingBoxAscent: 12,
            actualBoundingBoxDescent: 3,
          }),
        }),
        width: 0,
        height: 0,
      }),
    };
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

  it('uses the packed action-buttons atlas for unit icons instead of separate images', () => {
    class FakeImage {
      src = '';
      static instances: FakeImage[] = [];
      constructor() {
        FakeImage.instances.push(this);
      }
    }
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;

    const dialog = new SpawnDialog();
    dialog.mount(host, root);

    const urls = FakeImage.instances.map((i) => i.src);
    // All unit spawn icons (archer included) come from the single atlas,
    // never from separate files.
    for (const old of ['fist.png', 'horse.png', 'sword.png', 'shield.png', 'catapult.png', 'knight.png', 'arch.png']) {
      expect(urls.some((u) => u.endsWith(old))).toBe(false);
    }
    expect(urls.some((u) => u.endsWith('action-buttons-atlas.png'))).toBe(true);
    dialog.destroy();
  });

  it('lays out spawn icons at 3 per row and gives the popup exactly 3 columns', () => {
    const dialog = new SpawnDialog();
    dialog.mount(host, root);
    const popup = (dialog as unknown as { popup: { content: Container; contentWidth: number } }).popup;
    const items = popup.content.children.filter((c) => c instanceof Container && c.cursor === 'pointer');
    // One icon per type the player's tribe can spawn (base + tribe special), 3 per row.
    const playable = useGameStore.getState().players[0] ? spawnableTypesFor(useGameStore.getState().players[0]!).length : 0;
    expect(items.length).toBe(playable);
    const expectedRows = Math.ceil(playable / 3);
    const ys = items.map((c) => c.position.y);
    const xs = items.map((c) => c.position.x);
    const rowY = [...new Set(ys)].sort();
    expect(rowY.length).toBe(expectedRows);
    // First row exactly 3 icons with 4px gaps.
    const firstRow = items.filter((c) => c.position.y === rowY[0]!);
    expect(firstRow).toHaveLength(3);
    const rowXs = firstRow.map((c) => c.position.x).sort((a, b) => a - b);
    expect(rowXs[1]! - rowXs[0]!).toBeCloseTo(92 + 4, 5);
    expect(rowXs[2]! - rowXs[1]!).toBeCloseTo(92 + 4, 5);
    // Popup width fits exactly 3 cells + 2 * 4px inter-cell gaps + a 4px grid margin on each side.
    expect(popup.contentWidth).toBeCloseTo(3 * 92 + 2 * 4 + 2 * 4, 5);
    dialog.destroy();
  });

  it('renders the price row with 16px gold, wood and ore icons', () => {
    const dialog = new SpawnDialog();
    dialog.mount(host, root);
    const popup = (dialog as unknown as { popup: { content: Container } }).popup;
    const spriteSizes = new Set<number>();
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Sprite) spriteSizes.add(ch.width);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(popup.content);
    // Action icons are 56px; resource icons must be 16px.
    expect(spriteSizes).toContain(16);
    for (const size of spriteSizes) {
      expect(size).toBeGreaterThanOrEqual(16);
    }
    dialog.destroy();
  });
});

describe('spawnableTypesFor', () => {
  function playerOf(tribe: Tribe, index = 0): import('../src/game/players').Player {
    return {
      index, tribe, isHuman: true, name: 'p',
      resources: { wood: 100, stone: 100, money: 100, ore: 100 },
      score: 0, kills: 0, skills: [], isActive: true,
    };
  }

  it('lists the base units plus the player\'s own tribe special', () => {
    expect(spawnableTypesFor(playerOf(Tribe.Cats))).toContain('stalker');
    expect(spawnableTypesFor(playerOf(Tribe.Cats))).toHaveLength(8);
  });

  it('does not list other tribes special units', () => {
    const cats = spawnableTypesFor(playerOf(Tribe.Cats));
    expect(cats).not.toContain('banner');
    expect(cats).not.toContain('berserker');
    expect(cats).not.toContain('builder');
    expect(spawnableTypesFor(playerOf(Tribe.Warriors))).not.toContain('stalker');
    const warriors = spawnableTypesFor(playerOf(Tribe.Villagers));
    expect(warriors).toContain('builder');
  });
});
