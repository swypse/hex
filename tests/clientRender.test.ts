import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Application, Container, Graphics, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { MapView } from '../src/render/mapRenderer';
import { GameMap, MapTile } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { START_RESOURCES } from '../src/game/resources';
import { Tribe } from '../src/game/tribes';
import { Unit } from '../src/game/units';
import { axialKey } from '../src/game/hex';
import { generateMap } from '../src/game/mapGen';
import { buildMultiplayerPlayers } from '../src/game/players';
import { initialExplorationFor } from '../src/game/explore';
import { SeededRandom } from '../src/util/random';
import { type TextureSet, type TileTexture } from '../src/render/textureFactory';

const HEX = 40;
const SPRITE_SCALE = 1;
const TEX_H = 100;
const ANCHOR_Y = 0.7;

function tex(w: number, h: number): Texture {
  return new Texture({ source: new ImageSource({ width: w, height: h }) });
}

function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}

function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(TEX_H, TEX_H, ANCHOR_Y);
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

function players(): Player[] {
  return buildMultiplayerPlayers(
    [
      { name: 'Host', tribe: Tribe.Cats },
      { name: 'Guest', tribe: Tribe.Warriors },
    ],
    1,
    new SeededRandom(11),
  );
}

describe('client (player 1) sees his own units', () => {
  let map: GameMap;
  let pl: Player[];
  let textures: TextureSet;
  let view: MapView;

  beforeEach(() => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 40 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    pl = players();
    map = generateMap(pl.length, 42);
    for (const p of pl) initialExplorationFor(map, p.index);
    textures = buildTextures(map);
  });

  afterEach(() => {
    view?.destroy();
  });

  it('renders the guest capital unit visible for localPlayerIndex=1', () => {
    const spawn = map.spawns[1]!.start;
    const tile = map.tiles.find((t) => t.q === spawn.q && t.r === spawn.r)!;
    expect(tile.unit?.owner).toBe(1);
    expect(tile.exploredBy).toContain(1);

    view = new MapView(makeApp(), textures, HEX, SPRITE_SCALE, 2);
    view.update(map, pl, null, new Set(), new Set(), 1, new Set(), {
      x: 640, y: 400, scale: 1, width: 1280, height: 800,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
    const tv = tvs.get(axialKey({ q: spawn.q, r: spawn.r }))!;
    expect(tv.unitSprite).toBeDefined();
    expect(tv.unitSprite!.visible).toBe(true);
  });

  it('renders the host capital unit NOT visible for localPlayerIndex=1 (fogged to client)', () => {
    const spawn = map.spawns[0]!.start;
    const tile = map.tiles.find((t) => t.q === spawn.q && t.r === spawn.r)!;
    view = new MapView(makeApp(), textures, HEX, SPRITE_SCALE, 2);
    view.update(map, pl, null, new Set(), new Set(), 1, new Set(), {
      x: 640, y: 400, scale: 1, width: 1280, height: 800,
    });
    const tvs = (view as unknown as { tileViews: Map<string, { unitSprite: Sprite | null }> }).tileViews;
    const tv = tvs.get(axialKey({ q: spawn.q, r: spawn.r }))!;
    if (tv.unitSprite) expect(tv.unitSprite.visible).toBe(false);
  });
});
