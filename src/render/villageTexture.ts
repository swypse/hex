import type { Texture } from 'pixi.js';
import type { Settlement } from '../game/mapGen';
import type { TileTexture } from './textureFactory';

export interface VillageTextureSet {
  villageTextures: { level1: TileTexture; level2: TileTexture };
  freeVillageTexture: TileTexture;
}

export function villageTextureFor(
  settlement: Settlement | null,
  textures: VillageTextureSet,
): { texture: Texture | null; anchorY: number } {
  if (!settlement) return { texture: null, anchorY: 0.5 };
  if (settlement.owner === null) {
    return { texture: textures.freeVillageTexture.texture, anchorY: textures.freeVillageTexture.anchorY };
  }
  const v = settlement.level >= 2 ? textures.villageTextures.level2 : textures.villageTextures.level1;
  return { texture: v.texture, anchorY: v.anchorY };
}
