import { afterEach, describe, expect, it } from 'vitest';
import { Container, Sprite, BitmapText } from 'pixi.js';
import { HudScore } from '../src/ui/hud/HudScore';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tileTypes';

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
    const r = mount(3);
    expect(allSprites(r).length).toBeGreaterThan(0);
  });

  it('shows no buff icon with only 2 water temples', () => {
    const r = mount(2);
    expect(allSprites(r).length).toBe(0);
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
    const stage = host.app.stage as Container;
    expect(stage.children.length).toBe(0);
    (item.emit as (event: string) => void)('pointertap');
    expect(stage.children.length).toBe(1);
    const popupTexts: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof BitmapText) popupTexts.push((ch as BitmapText).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(stage);
    expect(popupTexts.join('\n')).toContain('Water Protection');
    expect(popupTexts.join('\n')).toContain('take 10 less damage');
    hud.destroy();
    expect(stage.children.length).toBe(0);
  });

  it('cancels the bounce animation when destroyed mid-bounce', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });

    const registered: Array<(t: { deltaMS: number }) => void> = [];
    const removed: Array<unknown> = [];
    const host = makeHost();
    const ticker = host.app.ticker as unknown as {
      add: (fn: (t: { deltaMS: number }) => void) => void;
      remove: (fn: unknown) => void;
    };
    ticker.add = (fn) => {
      registered.push(fn);
    };
    ticker.remove = (fn) => {
      removed.push(fn);
    };
    const root = new Container();
    const score = new HudScore();
    score.mount(host, root);

    // A score change starts the bounce animation's ticker callback.
    players[0]!.score += 10;
    useGameStore.setState({ players });
    expect(registered.length).toBeGreaterThan(0);

    // Destroy mid-bounce (e.g. quitting the skill tree): the ticker callback
    // must be cancelled, otherwise the next tick dereferences a null element.
    score.destroy();
    expect(removed).toContain(registered[0]);
  });
});
