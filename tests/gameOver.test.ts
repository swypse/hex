import { afterEach, describe, expect, it } from 'vitest';
import { Container, Sprite, Text } from 'pixi.js';
import { GameOver, placeColor } from '../src/ui/overlays/GameOver';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe, tribeById } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { placeWord } from '../src/i18n/lists';

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

  const mount = (opts?: { score?: number; turn?: number }, hostOverride?: UIHost): Container => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(42));
    players[0]!.score = opts?.score ?? 100;
    players[1]!.score = 50;
    players[2]!.score = 10;
    players.forEach((p) => {
      p.knownTribes = players.map((x) => x.tribe);
      p.kills = 5;
    });
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };
    useGameStore.setState({
      screen: 'game', players, localPlayerIndex: 0, winnerIndex: 0, mode: 'capture', bonusAwarded: false, turn: opts?.turn ?? 27,
    });
    root = new Container();
    screen = new GameOver();
    screen.mount(hostOverride ?? makeHost(), root);
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

  const collectStarLabels = (r: Container): string[] => {
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (
          ch instanceof Sprite
          && (ch.label === 'action-star' || ch.label === 'action-star-empty')
        ) {
          out.push(String(ch.label));
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  const collectStarSprites = (r: Container): Sprite[] => {
    const out: Sprite[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Sprite && (ch.label === 'action-star' || ch.label === 'action-star-empty')) {
          out.push(ch as Sprite);
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  const collectStarWrappers = (r: Container): Container[] => {
    const out: Container[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (
          ch instanceof Container
          && ch.children.some(
            (x) => x instanceof Sprite && (x.label === 'action-star' || x.label === 'action-star-empty'),
          )
        ) {
          out.push(ch as Container);
        }
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(r);
    return out;
  };

  it('announces the winner in the banner', () => {
    const r = mount();
    const texts = allTexts(r);
    const localName = useGameStore.getState().players[0]!.name;
    expect(texts.some((t) => t.includes(localName))).toBe(true);
  });

  it('lists every tribe at once, ranked by place', () => {
    const r = mount();
    const texts = allTexts(r);
    const players = useGameStore.getState().players;
    for (const p of players) {
      const tribeName = tribeById(p.tribe)!.name;
      expect(texts.some((t) => t.includes(tribeName))).toBe(true);
    }
  });

  it('shows place words for each rank', () => {
    const r = mount();
    const texts = allTexts(r);
    expect(texts.includes(placeWord(1))).toBe(true);
    expect(texts.includes(placeWord(2))).toBe(true);
    expect(texts.includes(placeWord(3))).toBe(true);
  });

  it('shows the game turn count', () => {
    const r = mount();
    expect(allTexts(r).some((t) => t.includes('Turns: 27'))).toBe(true);
  });

  it('shows stat rows for every player without requiring selection', () => {
    const r = mount();
    const texts = allTexts(r);
    // One block of stat rows per player (3 players), each with kills > 0.
    expect(texts.filter((t) => t === 'Kills').length).toBe(3);
  });

  it('hides zero-count rows and empty achievement blocks', () => {
    const r = mount();
    const texts = allTexts(r);
    // No player destroyed a tribe or unlocked achievements in this fixture.
    expect(texts.some((t) => t === 'Tribes destroyed')).toBe(false);
    expect(texts.some((t) => t === 'Achievements')).toBe(false);
  });

  it('shows the quick-capture bonus row for the winner when within budget', () => {
    const r = mount({ turn: 10 });
    const texts = allTexts(r);
    expect(texts.includes('Quick capture')).toBe(true);
    // 3 players × 20 = 60 points.
    expect(texts.includes('+60')).toBe(true);
  });

  it('hides the quick-capture row when the win is too slow', () => {
    const r = mount({ turn: 27 });
    expect(allTexts(r).some((t) => t === 'Quick capture')).toBe(false);
  });

  it('draws the winner rating as a centered row of 3 stars', () => {
    // Default fixture: 1★ (low score).
    const r = mount();
    expect(collectStarLabels(r)).toEqual(['action-star', 'action-star-empty', 'action-star-empty']);
  });

  it('fills stars for higher ratings', () => {
    // 3 players, 3★ needs >= 1100 total and turn <= 25; 2★ needs >= 850.
    expect(collectStarLabels(mount({ score: 3000, turn: 10 }))).toEqual([
      'action-star', 'action-star', 'action-star',
    ]);
    // High score but past the quick-capture budget keeps the 3rd star empty.
    expect(collectStarLabels(mount({ score: 3000, turn: 27 }))).toEqual([
      'action-star', 'action-star', 'action-star-empty',
    ]);
  });

  it('appears stars one by one with a bounce-in scale animation', () => {
    const registered: Array<(t: { deltaMS: number }) => void> = [];
    const removed: unknown[] = [];
    const ticker = {
      add: (fn: (t: { deltaMS: number }) => void) => {
        registered.push(fn);
      },
      remove: (fn: unknown) => {
        removed.push(fn);
      },
    };
    const host = {
      app: { screen: { width: 1280, height: 800 }, stage: new Container(), ticker },
      screenLayer: new Container(),
      overlayLayer: new Container(),
    } as unknown as UIHost;

    const r = mount({ score: 3000, turn: 10 }, host);
    const stars = collectStarSprites(r);
    const wrappers = collectStarWrappers(r);
    expect(stars.length).toBe(3);
    expect(wrappers.length).toBe(3);
    // One ticker callback per star wrapper (plus the popup card entrance tween);
    // all wrappers start hidden (scale 0) while the star sprites keep their size.
    expect(registered.length).toBeGreaterThanOrEqual(3);
    expect(wrappers.every((w) => w.scale.x === 0)).toBe(true);

    // Advance enough time for the staggered delays to resolve (per-frame capped):
    // each wrapper bounces in from small and settles at exactly 100%.
    for (let k = 0; k < 20; k++) registered.forEach((fn) => fn({ deltaMS: 200 }));
    expect(wrappers.every((w) => w.scale.x === 1)).toBe(true);

    screen.destroy();
    // Every star's animation callback got removed (self-removal on finish and/or
    // on destroy), and destroying mid-animation must not throw.
    expect(removed.length).toBeGreaterThanOrEqual(3);
  });
});