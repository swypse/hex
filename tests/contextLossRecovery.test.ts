import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Application, Container, Text, Texture, ImageSource } from 'pixi.js';
import { Tribe } from '../src/game/tribes';
import { TRIBES } from '../src/game/tribes';
import { axialKey } from '../src/game/hex';
import { type GameMap } from '../src/game/mapGen';
import type { TextureSet, TileTexture } from '../src/render/textureFactory';
import { villageTexturesForTest } from './helpers/villageTextures';
import { GameScreen } from '../src/ui/screens/GameScreen';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

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
    villageTextures: villageTexturesForTest(tileTex(40, 40, 0.7), tileTex(40, 40, 0.7)),
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
    wallTexture: null,
    arrowTexture: tex(67, 13),
    cannonballTexture: tex(35, 15),
  });
  return { createTextures: async (_app: Application, map: GameMap): Promise<TextureSet> => build(map) };
});

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
  mapRoot: Container | null;
  textures: TextureSet | null;
  mapView: {
    container: Container;
    overlay: Container;
    markerLayer: Container;
    destroy(): void;
  } | null;
  recoverFromContextLoss(): Promise<void>;
  shutdown(): void;
};

describe('WebGL context loss recovery', () => {
  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    controller.shutdown();
    useGameStore.setState({
      screen: 'start',
      players: [],
      turn: 1,
      currentPlayerIndex: 0,
      aiActive: false,
      selection: null,
      overlay: null,
      netMode: 'single',
      pendingSnapshot: null,
      texturesLoading: false,
    });
  });

  afterEach(() => {
    controller.shutdown();
    useGameStore.getState().setScreen('start');
  });

  it('rebuilds the map scene with fresh textures after the context is restored', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    const app = makeApp();
    const host = makeHost(app);
    const screen = new GameScreen();
    screen.mount(host);

    // Let the (mocked) initial createTextures + render finish.
    await new Promise((r) => setTimeout(r, 50));

    expect(controller.textures).not.toBeNull();
    expect(controller.mapView).not.toBeNull();
    const before = controller.mapView!;
    const root = controller.mapRoot!;
    expect(root.children).toContain(before.container);
    // Ground markers mount above the overlay so they never sit under the
    // village labels / hp bars / capture icons drawn there.
    const rootIdx = (c: Container): number => root.children.indexOf(c);
    expect(rootIdx(before.markerLayer)).toBeGreaterThan(rootIdx(before.overlay));
    expect(rootIdx(before.overlay)).toBeGreaterThan(rootIdx(before.container));

    const texturesBefore = controller.textures!;
    await controller.recoverFromContextLoss();

    const after = controller.mapView!;
    expect(after).not.toBe(before);
    expect(controller.textures).not.toBe(texturesBefore);
    expect(before.container.destroyed).toBe(true);
    expect(root.children).not.toContain(before.container);
    expect(root.children).toContain(after.container);
    expect(useGameStore.getState().texturesLoading).toBe(false);

    screen.destroy();
  });

  it('is a no-op when no map is currently rendered (e.g. on the start screen)', async () => {
    await gameController.startGame(TRIBES[0]!.id, 1, 'capture');
    expect(controller.mapView).toBeNull();
    useGameStore.setState({ texturesLoading: false });

    await controller.recoverFromContextLoss();

    expect(controller.mapView).toBeNull();
    expect(useGameStore.getState().texturesLoading).toBe(false);
  });
});
