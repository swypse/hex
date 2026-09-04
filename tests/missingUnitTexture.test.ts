import { describe, expect, it } from 'vitest';
import { Application, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { MapView } from '../src/render/mapRenderer';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { axialKey } from '../src/game/hex';
import { tileAt } from '../src/game/selection';
import { generateMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { initialExplorationFor } from '../src/game/explore';
import { SeededRandom } from '../src/util/random';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';

const HEX = 40;
const TEX_H = 100;

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}

function tileTex(w: number, h: number, anchorY = 0.7): TileTexture {
  return { texture: tex(w, h), anchorY };
}

function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(TEX_H, TEX_H);
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
  };
}

function makeApp(): Application {
  return {
    screen: { width: 1280, height: 800 },
    ticker: { add: (): void => {}, remove: (): void => {} },
  } as unknown as Application;
}

describe('MapView unit texture resilience', () => {
  it('renders without crashing when a unit texture entry is missing', () => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    const pl: Player[] = buildMultiplayerPlayers(
      [
        { name: 'Host', tribe: Tribe.Cats },
        { name: 'Guest', tribe: Tribe.Warriors },
      ],
      1,
      new SeededRandom(11),
    );
    const map: GameMap = generateMap(pl.length, 42);
    for (const p of pl) initialExplorationFor(map, p.index);
    const textures = buildTextures(map);
    // Simulate an image load failure: drop the warrior texture for the AI tribe.
    const aiTribe = pl[2]!.tribe;
    const aiTribeLut = (textures.unitTextures as Record<number, Record<string, TileTexture>>)[aiTribe];
    delete aiTribeLut!.warrior;
    // Reveal the AI unit's tile to the local player so its hp bar is built too
    // (that path calls unitTextureTop, which must not crash on the missing entry).
    const aiSpawn = map.spawns[2]!.start;
    const aiTile = tileAt(map, aiSpawn.q, aiSpawn.r)!;
    aiTile.exploredBy = [1];

    const view = new MapView(makeApp(), textures, HEX, 1, 2);
    expect(() =>
      view.update(map, pl, null, new Set(), new Set(), 1, new Set(), {
        x: 640, y: 400, scale: 1, width: 1280, height: 800,
      }),
    ).not.toThrow();

    const tvs = (view as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
    const tv = tvs.get(axialKey({ q: aiSpawn.q, r: aiSpawn.r }))!;
    // The AI unit should still get a sprite (fallback), just fogged to the client.
    expect(tv.unitSprite).toBeDefined();
  });
});
