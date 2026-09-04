import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Application, Container, Graphics, ImageSource, Text, Texture } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { Simulator } from '../src/game/simulator';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { UNIT_TYPES, type Unit } from '../src/game/units';
import { axialKey } from '../src/game/hex';
import { type GameEvent } from '../src/game/events';
import { MapView } from '../src/render/mapRenderer';
import { useGameStore } from '../src/store/gameStore';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';
import { installCamera } from './helpers/testMap';

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}
function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}
function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(100, 100, 0.7);
  const tribes: Tribe[] = [Tribe.Cats, Tribe.Warriors, Tribe.Barbarians, Tribe.Villagers, Tribe.Forest, Tribe.Aqua];
  const unitTextures = Object.fromEntries(
    tribes.map((t) => [t, { warrior: unitTex, rider: unitTex, archer: unitTex, swordsman: unitTex, shield: unitTex }]),
  ) as TextureSet['unitTextures'];
  const shipTextures = Object.fromEntries(
    tribes.map((t) => [t, { 1: unitTex, 2: unitTex, 3: unitTex }]),
  ) as TextureSet['shipTextures'];
  return {
    tileTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTextures: new Map(map.tiles.map((t) => [axialKey(t), tileTex(50, 50)])),
    fogTopTexture: tileTex(50, 50),
    villageTextures: { level1: tileTex(40, 40, 0.7), level2: tileTex(40, 40, 0.7) },
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
    villageConnectedTexture: null,
    captureTexture: null,
  };
}

function tile(q: number, r: number): MapTile {
  return {
    q, r, terrain: TileType.GrasslandLand, height: 0.1, settlement: null, building: null,
    roadOwner: null, unit: null, ownedBy: null, claimedByVillage: null, exploredBy: [0, 1],
  };
}

describe('bonus claim notifications', () => {
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
    (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = ((cb: (t: number) => void) => setTimeout(() => cb(0), 0)) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    if (realRaf) (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = realRaf;
    mapView.destroy();
  });

  it('does not notify the local player about another player claiming a bonus', async () => {
    const ev: GameEvent = { type: 'bonusClaimed', q: 1, r: 0, kind: 'money', playerIndex: 0 };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBeNull();
  });

  it('notifies the local player with Skill {name} opened! for a skill bonus', async () => {
    const ev: GameEvent = { type: 'bonusClaimed', q: 1, r: 0, kind: 'skill', playerIndex: 1, skill: 'navigation' };
    await (gc as { presentEvents: (e: GameEvent[], pre: Set<string>) => Promise<void> }).presentEvents([ev], new Set());
    expect(useGameStore.getState().centerMessage).toBe('Skill Navigation opened!');
  });
});
