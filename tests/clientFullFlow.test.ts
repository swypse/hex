import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application, Container, Sprite, Text, Texture, ImageSource } from 'pixi.js';
import { Simulator } from '../src/game/simulator';
import { generateMap, type GameMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { initialExplorationFor } from '../src/game/explore';
import { SeededRandom } from '../src/util/random';
import { Tribe } from '../src/game/tribes';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { GameScreen } from '../src/ui/screens/GameScreen';
import { axialKey } from '../src/game/hex';
import type { TextureSet, TileTexture } from '../src/render/textureFactory';
import type { HostMessage } from '../src/net/peerSession';
import type { UIHost } from '../src/ui/host';

vi.mock('../src/render/textureFactory', async () => {
  const { Texture, ImageSource } = await import('pixi.js');
  const tex = (w: number, h: number): Texture => new Texture({ source: new ImageSource({ width: w, height: h }) });
  const tileTex = (w: number, h: number, anchorY = 0.5): TileTexture => ({ texture: tex(w, h), anchorY });
  const unitTex = tileTex(100, 100, 0.7);
  const unitTextures = {} as TextureSet['unitTextures'];
  for (const tribe of [Tribe.Villagers, Tribe.Warriors, Tribe.Cats]) {
    unitTextures[tribe] = {
      warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex,
      shield: unitTex, catapult: unitTex,
    } as unknown as TextureSet['unitTextures'][Tribe];
  }
  const shipTextures = {} as TextureSet['shipTextures'];
  for (const tribe of [Tribe.Villagers, Tribe.Warriors, Tribe.Cats]) {
    shipTextures[tribe] = { 1: unitTex, 2: unitTex, 3: unitTex };
  }
  const build = (map: GameMap): TextureSet => ({
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    villageTextures: { level1: tileTex(40, 40, 0.7), level2: tileTex(40, 40, 0.7) },
    freeVillageTexture: tileTex(40, 40),
    unitTextures,
    pirateTexture: unitTex,
    sawmillTexture: tileTex(50, 50),
    mineTexture: tileTex(50, 50),
    portTextures: {
      e: tileTex(40, 40, 0.7), ne: tileTex(40, 40, 0.7), nw: tileTex(40, 40, 0.7),
      w: tileTex(40, 40, 0.7), sw: tileTex(40, 40, 0.7), se: tileTex(40, 40, 0.7),
    },
    bridgeTextures: { nw: unitTex, ne: unitTex, we: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: { 1: tileTex(40, 40, 0.7), 2: tileTex(40, 40, 0.7), 3: tileTex(40, 40, 0.7), 4: tileTex(40, 40, 0.7) },
    forestTempleTextures: { 1: tileTex(40, 40, 0.7), 2: tileTex(40, 40, 0.7), 3: tileTex(40, 40, 0.7), 4: tileTex(40, 40, 0.7) },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
  });
  return { createTextures: async (_app: Application, map: GameMap): Promise<TextureSet> => build(map) };
});

function buildSim(): Simulator {
  const players = buildMultiplayerPlayers(
    [
      { name: 'Host', tribe: Tribe.Cats },
      { name: 'Guest', tribe: Tribe.Warriors },
    ],
    1,
    new SeededRandom(11),
  );
  const map = generateMap(players.length, 42);
  for (const p of players) initialExplorationFor(map, p.index);
  return new Simulator(map, players, 'turns30', { rng: () => 0.5 });
}

function makeApp(): Application {
  return {
    screen: { width: 1280, height: 800 },
    stage: new Container(),
    ticker: { add: (): void => {}, remove: (): void => {} },
    canvas: {} as HTMLCanvasElement,
  } as unknown as Application;
}

function makeHost(app: Application): UIHost {
  return { app, screenLayer: new Container(), overlayLayer: new Container() };
}

const controller = gameController as unknown as {
  onHostMessage(msg: HostMessage): void;
  shutdown(): void;
};

describe('full client entry flow', () => {
  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    controller.shutdown();
    useGameStore.setState({
      screen: 'lobby',
      players: [],
      selection: null,
      overlay: null,
      localPlayerIndex: -1,
      netMode: 'client',
      pendingSnapshot: null,
      texturesLoading: false,
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      gameOver: false,
      winnerIndex: null,
      expectedTurns: 0,
      bonusAwarded: false,
    });
  });

  afterEach(() => {
    controller.shutdown();
    useGameStore.getState().setScreen('start');
  });

  it('renders the guest units for the client and keeps the end turn button', async () => {
    const sim = buildSim();
    sim.startGame();
    sim.drainEvents();

    controller.onHostMessage({ type: 'state', state: sim.snapshot(), playerIndex: 1 });

    expect(useGameStore.getState().localPlayerIndex).toBe(1);
    expect(useGameStore.getState().screen).toBe('game');

    const app = makeApp();
    const host = makeHost(app);
    const screen = new GameScreen();
    screen.mount(host);

    // Let the mocked createTextures promise and the enqueued adoptSnapshot run.
    await new Promise((r) => setTimeout(r, 50));

    const gc = gameController as unknown as {
      mapView: { tileViews: Map<string, { unitSprite: Sprite | null }> };
      textures: TextureSet | null;
      getNetwork(): { pendingClientEvents: unknown[] };
    };
    expect(gc.textures).not.toBeNull();
    expect(gc.mapView).toBeDefined();

    const spawn = sim.map.spawns[1]!.start;
    const tv = gc.mapView.tileViews.get(axialKey(spawn))!;
    expect(tv.unitSprite).toBeDefined();
    expect(tv.unitSprite!.visible).toBe(true);

    screen.destroy();
  });
});
