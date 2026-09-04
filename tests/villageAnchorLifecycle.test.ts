import { describe, expect, it } from 'vitest';
import { Application, Container, ImageSource, Sprite, Text, Texture } from 'pixi.js';
import { MapView } from '../src/render/mapRenderer';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { axialKey } from '../src/game/hex';
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

function tileTex(w: number, h: number, anchorY = 0.5): TileTexture {
  return { texture: tex(w, h), anchorY };
}

function buildTextures(map: GameMap): TextureSet {
  const unitTex = tileTex(TEX_H, TEX_H, 0.7);
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
    villageTextures: {
      level1: { texture: tex(40, 40), anchorY: 0.7 },
      level2: { texture: tex(50, 50), anchorY: 0.75 },
    },
    freeVillageTexture: tileTex(30, 30),
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

function villageSprite(view: MapView, tile: MapTile): Sprite | null {
  const tvs = (view as unknown as { tileViews: Map<string, { villageSprite: Sprite | null }> }).tileViews;
  return tvs.get(axialKey(tile))!.villageSprite;
}

describe('village texture anchor across lifecycle', () => {
  it('updates the village sprite anchor when the village is captured and upgraded', () => {
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
    const view = new MapView(makeApp(), textures, HEX, 1, 2);
    const viewport = { x: 640, y: 400, scale: 1, width: 1280, height: 800 };

    // Use a free (unowned) settlement.
    const tile = map.tiles.find((t) => t.settlement && t.settlement.owner === null)!;
    const settlement = tile.settlement! as Settlement;

    // Render as a free village: anchor should come from the empty village texture.
    view.update(map, pl, null, new Set(), new Set(), 0, new Set(), viewport);
    let sprite = villageSprite(view, tile)!;
    expect(sprite.anchor.y).toBe(textures.freeVillageTexture.anchorY);

    // Capture it (owner set, level 1): anchor should now use the level1 texture anchor.
    settlement.owner = 0;
    view.update(map, pl, null, new Set(), new Set(), 0, new Set(), viewport);
    sprite = villageSprite(view, tile)!;
    expect(sprite.anchor.y).toBe(textures.villageTextures.level1.anchorY);

    // Upgrade to level 2: anchor should follow the level2 texture anchor.
    settlement.level = 2;
    view.update(map, pl, null, new Set(), new Set(), 0, new Set(), viewport);
    sprite = villageSprite(view, tile)!;
    expect(sprite.anchor.y).toBe(textures.villageTextures.level2.anchorY);
  });
});
