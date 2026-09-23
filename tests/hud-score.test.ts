import { afterEach, describe, expect, it } from 'vitest';
import { Container, Sprite, BitmapText } from 'pixi.js';
import { HudScore } from '../src/ui/hud/hud-score';
import { totalScore } from '../src/game/score';
import { FONT_BLACK } from '../src/ui/kit/bitmap-fonts';
import { useGameStore } from '../src/store/game-store';
import { gameController } from '../src/controller/game-controller';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt } from './helpers/test-map';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tile-types';
import { SCORE_PAD, SCORE_TOP_OFFSET, SCORE_CHIP_RADIUS, SCORE_TEXT_CHIP_GAP, SCORE_TEXT_HEIGHT } from '../src/ui/layout';

function makeHost(): UIHost {
  return {
    app: { screen: { width: 1280, height: 800 }, stage: new Container(), ticker: { add: () => {}, remove: () => {} } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudScore buff icons', () => {
  let hud: HudScore;
  let root: Container;
  let host: UIHost;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const mount = (waterTemples: number): Container => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    for (const q of [1, 2, 3]) {
      const tile = tileAt(map, q, 0)!;
      tile.terrain = TileType.Water;
      tile.ownedBy = 0;
      if (q <= waterTemples) tile.building = { kind: 'temple', level: 1 };
    }
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    host = makeHost();
    hud = new HudScore();
    hud.mount(host, root);
    return root;
  };

  afterEach(() => {
    if (hud) hud.destroy();
    (gameController as unknown as { sim: unknown }).sim = originalSim;
  });

  const allSprites = (r: Container): Sprite[] => {
    const out: Sprite[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Sprite) out.push(ch as Sprite);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  it('shows a water protection icon when the player has 3 water temples', () => {
    mount(3);
    const buffRow = (hud as unknown as { buffRow: Container }).buffRow!;
    expect(allSprites(buffRow).length).toBeGreaterThan(0);
  });

  it('renders the local player tribe chip and orange bold score text below it', () => {
    mount(0);
    const hudAny = hud as unknown as { text: BitmapText | null; tribeChip: Container | null };
    expect(hudAny.tribeChip).not.toBeNull();
    expect(hudAny.text).not.toBeNull();
    // Orange bold 16px score label (bold = Roboto Black family).
    expect(hudAny.text!.style.fontSize).toBe(16);
    expect(hudAny.text!.style.fill).toBe(0xffc465);
    expect(hudAny.text!.style.fontFamily).toBe(FONT_BLACK);
    // The chip holds a white circle + clipped tribe icon sprite.
    expect(hudAny.tribeChip!.children.some((c) => c instanceof Sprite)).toBe(true);
    // The score text sits below the chip, centred on it, with a 6px gap.
    const chipX = host.app.screen.width - SCORE_PAD - SCORE_CHIP_RADIUS;
    const chipY = SCORE_PAD + SCORE_TOP_OFFSET + SCORE_CHIP_RADIUS;
    expect(hudAny.tribeChip!.position.x).toBeCloseTo(chipX, 5);
    expect(hudAny.tribeChip!.position.y).toBeCloseTo(chipY, 5);
    expect(hudAny.text!.position.x).toBeCloseTo(chipX, 5);
    // Text centred vertically so the top of the label sits 6px below the chip
    // bottom edge.
    expect(hudAny.text!.position.y).toBeCloseTo(chipY + SCORE_CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT / 2, 5);
  });

  it('shows the real map score at start instead of a stale 0', () => {
    mount(0);
    const map = gameController.getMap()!;
    const { players, localPlayerIndex } = useGameStore.getState();
    const expected = totalScore(map, players[localPlayerIndex]!);
    expect(expected).toBeGreaterThan(0); // the test only matters if the start score is non-zero
    const hudAny = hud as unknown as { text: BitmapText };
    expect(hudAny.text!.text).toBe(String(expected));
  });

  it('shows no buff icon with only 2 water temples', () => {
    mount(2);
    const buffRow = (hud as unknown as { buffRow: Container }).buffRow!;
    expect(allSprites(buffRow).length).toBe(0);
  });

  it('shows just the buff icon with no number label', () => {
    mount(3);
    const buffRow = (hud as unknown as { buffRow: Container }).buffRow!;
    expect(buffRow.children.length).toBe(1);
    const item = buffRow.children[0]!;
    const texts = item.children.filter((c) => c instanceof BitmapText) as BitmapText[];
    expect(texts).toHaveLength(0);
    const sprites = item.children.filter((c) => c instanceof Sprite) as Sprite[];
    expect(sprites).toHaveLength(1);
  });

  it('stacks buff items vertically under the score circle', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    for (const q of [1, 2, 3]) {
      const tile = tileAt(map, q, 0)!;
      tile.terrain = TileType.Water;
      tile.ownedBy = 0;
      if (q <= 3) tile.building = { kind: 'temple', level: 1 };
    }
    for (const r of [1, 2, 3]) {
      const tile = tileAt(map, 0, r)!;
      tile.terrain = TileType.GrasslandForest;
      tile.ownedBy = 0;
      tile.building = { kind: 'forestTemple', level: 1 };
    }
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    hud = new HudScore();
    hud.mount(makeHost(), root);
    const buffRow = (hud as unknown as { buffRow: Container }).buffRow!;
    // Two items (water + forest protection) in a vertical column.
    expect(buffRow.children.length).toBe(2);
    const ys = buffRow.children.map((c) => c.position.y);
    expect(ys[1]!).toBe(ys[0]! + 16 + 8);
    expect(buffRow.children.every((c) => c.position.x === 0)).toBe(true);
  });

  it('opens a popup with the buff description on tap and closes it on destroy', () => {
    mount(3);
    const buffRow = (hud as unknown as { buffRow: Container }).buffRow!;
    const item = buffRow.children[0] as Container;
    const overlay = host.overlayLayer as Container;
    expect(overlay.children.length).toBe(0);
    (item.emit as (event: string) => void)('pointertap');
    expect(overlay.children.length).toBe(1);
    const popupTexts: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) popupTexts.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(overlay);
    expect(popupTexts.join('\n')).toContain('Water Protection');
    expect(popupTexts.join('\n')).toContain('take 10 less damage');
    hud.destroy();
    expect(overlay.children.length).toBe(0);
  });

  it('does not run an animation when a new score is claimed', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));

    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });

    const registered: Array<() => void> = [];
    const host = makeHost();
    (host.app.ticker as unknown as { add: (fn: () => void) => void }).add = (fn) => {
      registered.push(fn);
    };
    const root = new Container();
    const score = new HudScore();
    score.mount(host, root);

    players[0]!.score += 10;
    useGameStore.setState({ players });
    expect(registered.length).toBe(0);
    score.destroy();
  });

  it('fires onTap when the score chip is tapped', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    host = makeHost();
    let tapped = 0;
    hud = new HudScore();
    hud.onTap = () => {
      tapped++;
    };
    hud.mount(host, root);
    (hud as unknown as { el: Container }).el!.emit('pointertap', {} as never);
    expect(tapped).toBe(1);
  });
});
