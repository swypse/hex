import { afterEach, describe, expect, it } from 'vitest';
import { Container, Sprite, Text } from 'pixi.js';
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
    app: { screen: { width: 1280, height: 800 }, stage: new Container(), ticker: { add: () => {} } },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudScore buff icons', () => {
  let hud: HudScore;
  let root: Container;
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
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0 });
    root = new Container();
    hud = new HudScore();
    hud.mount(makeHost(), root);
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
});
