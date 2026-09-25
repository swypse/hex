import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Application, Container, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/game-controller';
import { Simulator } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/map-gen';
import { TileType } from '../src/game/tile-types';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { axialKey } from '../src/game/hex';
import { type GameEvent } from '../src/game/events';
import { MapView } from '../src/render/map-renderer';
import { useGameStore } from '../src/store/game-store';
import { type TextureSet, type TileTexture } from '../src/render/texture-factory';
import { installCamera } from './helpers/test-map';

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}
function tileTex(w: number, h: number): TileTexture {
  return { texture: tex(w, h), anchorY: 0.5 };
}
function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(100, 100);
  const tribes: Tribe[] = [Tribe.Cats, Tribe.Warriors, Tribe.Barbarians, Tribe.Villagers, Tribe.Forest, Tribe.Aqua];
  const unitTextures = Object.fromEntries(
    tribes.map((t) => [t, { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex, shield: unitTex }]),
  ) as TextureSet['unitTextures'];
  const shipTextures = Object.fromEntries(tribes.map((t) => [t, { 1: unitTex, 2: unitTex, 3: unitTex }])) as TextureSet['shipTextures'];
  return {
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    freeVillageTexture: tileTex(40, 40),
    unitTextures,
    pirateTexture: unitTex,
    sawmillTexture: tileTex(50, 50),
    mineTexture: tileTex(50, 50),
    portTextures: { e: unitTex, ne: unitTex, nw: unitTex, w: unitTex, sw: unitTex, se: unitTex },
    bridgeTextures: { nw: unitTex, ne: unitTex, we: unitTex },
    freePortTexture: tex(40, 40),
    templeTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    forestTempleTextures: { 1: unitTex, 2: unitTex, 3: unitTex, 4: unitTex },
    shipTextures,
    bonusTexture: tileTex(50, 50),
    bottleTexture: tileTex(50, 50),
    villageConnectedTexture: null,
    captureTexture: null,
    wallTexture: null,
    arrowTexture: tex(67, 13),
    glowFor: new Map(),
    cannonballTexture: tex(35, 15),
    attackIconTexture: null,
    cannonbalTexture: null,
  };
}

function tile(q: number, r: number): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1],
  };
}

describe('stalker spotted notification', () => {
  let gc: Record<string, unknown>;
  let mapView: MapView;
  let realRaf: typeof requestAnimationFrame | undefined;

  beforeEach(() => {
    const tiles: MapTile[] = [];
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) tiles.push(tile(q, r));
    const map: GameMap = { radius: 2, tiles, spawns: [] };
    const players: Player[] = [
      { index: 0, tribe: Tribe.Warriors, isHuman: true, name: 'H', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
      { index: 1, tribe: Tribe.Cats, isHuman: true, name: 'C', resources: { ...START_RESOURCES }, score: 0, kills: 0, skills: [], isActive: true },
    ];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();

    const app = { screen: { width: 800, height: 600 }, ticker: { add: (): void => {}, remove: (): void => {} } } as unknown as Application;
    const textures = buildTextures(map);
    mapView = new MapView(app, textures, 40, 0.5, 2);

    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    useGameStore.setState({ localPlayerIndex: 1, netMode: 'client', players, centerMessage: null, centerMessageQueue: [] });

    gc = gameController as unknown as Record<string, unknown>;
    (gc as { app: unknown }).app = app;
    (gc as { sim: unknown }).sim = sim;
    (gc as { mapView: unknown }).mapView = mapView;
    (gc as { mapRoot: unknown }).mapRoot = new Container();
    (gc as { textures: unknown }).textures = textures;
    (gc as { hiddenUnitIds: Set<string> }).hiddenUnitIds.clear();
    installCamera(gc, app, map.radius);

    realRaf = (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame!;
    (globalThis as { performance: Performance }).performance.now = () => 0;
    (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(0), 0)) as unknown as typeof requestAnimationFrame;
  });

  afterEach(() => {
    if (realRaf) (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = realRaf;
    mapView.destroy();
  });

  it('shows "Stalker in the {village}!" to every player when a stalker is spotted', async () => {
    const villageTile = (gc as { sim: { map: GameMap } }).sim.map.tiles.find((t) => t.q === 1 && t.r === 0)!;
    villageTile.settlement = { owner: 0, level: 1, captureReady: false, name: 'Willow Creek' };
    const ev: GameEvent = { type: 'stalkerSpotted', unitId: 's1', villageQ: 1, villageR: 0 };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Stalker in the Willow Creek!');
  });

  it('falls back to a generic village name when the village has none', async () => {
    const ev: GameEvent = { type: 'stalkerSpotted', unitId: 's1', villageQ: 1, villageR: 0 };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Stalker in the Settlement!');
  });
});