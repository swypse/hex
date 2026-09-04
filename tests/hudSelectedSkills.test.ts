import { afterEach, describe, expect, it } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudSelected } from '../src/ui/hud/HudSelected';
import { useGameStore } from '../src/store/gameStore';
import { gameController } from '../src/controller/gameController';
import { type UIHost } from '../src/ui/host';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/tileTypes';
import { type SkillId } from '../src/game/skills';
import { type GameMap, type MapTile } from '../src/game/mapGen';

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
    app: { screen: { width: 1280, height: 800 }, stage: new Container() },
    screenLayer: new Container(),
    overlayLayer: new Container(),
  } as unknown as UIHost;
}

describe('HudSelected skill unlock hints', () => {
  let hud: HudSelected | null = null;
  const originalSim = (gameController as unknown as { sim: unknown }).sim;

  const allTexts = (): string[] => {
    const el = (hud as unknown as { el: Container }).el!;
    const out: string[] = [];
    const walk = (c: Container): void => {
      for (const ch of c.children) {
        if (ch instanceof Text) out.push((ch as Text).text);
        if (ch instanceof Container) walk(ch as Container);
      }
    };
    walk(el);
    return out;
  };

  function setup(map: GameMap, tile: MapTile, skills: SkillId[]): void {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({ getContext: () => fakeCanvasContext(), width: 0, height: 0 }),
    };

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = skills;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: Simulator | null }).sim = sim;
    useGameStore.setState({
      screen: 'game',
      players,
      localPlayerIndex: 0,
      selection: { kind: 'terrain', q: tile.q, r: tile.r },
      tutorial: false,
      tutorialStep: null,
    });
  }

  afterEach(() => {
    hud?.destroy();
    hud = null;
    (gameController as unknown as { sim: unknown }).sim = originalSim;
    useGameStore.setState({ screen: 'start', players: [], selection: null });
  });

  it('suggests Open Defense on an owned wall-less village after Shields', () => {
    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false, name: 'Alpha' };
    setup(map, village, ['shields']);
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(allTexts().join('\n')).toContain('Open Defense');
  });

  it('does not suggest Open Defense before Shields is open', () => {
    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false, name: 'Alpha' };
    setup(map, village, []);
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(allTexts().join('\n')).not.toContain('Open Defense');
  });

  it('suggests Open Roads on a road-capable tile after Forestry', () => {
    const map = makeTestMap(2);
    const village = tileAt(map, 0, 0)!;
    village.settlement = { owner: 0, level: 1, captureReady: false, name: 'Alpha' };
    setup(map, tileAt(map, 1, 0)!, ['forestry']);
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(allTexts().join('\n')).toContain('Open Roads');
  });

  it('suggests Open Bridges on a bridgeable water stretch after Riding', () => {
    const map = makeTestMap(2);
    const water = tileAt(map, 0, 0)!;
    water.terrain = TileType.Water;
    water.height = 0;
    setup(map, water, ['riding']);
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(allTexts().join('\n')).toContain('Open Bridges');
  });

  it('suggests Open Geology on a mountain after Science', () => {
    const map = makeTestMap(2);
    const peak = tileAt(map, 0, 0)!;
    peak.terrain = TileType.GrasslandMountain;
    setup(map, peak, ['science']);
    hud = new HudSelected();
    hud.mount(makeHost(), new Container());
    expect(allTexts().join('\n')).toContain('Open Geology');
  });
});
