import type { Texture } from 'pixi.js';
import { Tribe } from '../game/tribes';
import type { Settlement } from '../game/mapGen';
import type { Player } from '../game/players';
import type { TileTexture } from './textureFactory';

export interface VillageTextureSet {
  /** Per-tribe owned village textures; each entry falls back to the generic
   *  `village*.png` when that tribe has no own texture files. */
  villageTextures: Record<Tribe, { level1: TileTexture; level2: TileTexture }>;
  freeVillageTexture: TileTexture;
}

/** Tribe whose village texture applies to this settlement (null when free or
 *  when the owner's tribe cannot be resolved). */
export function villageOwnerTribe(
  settlement: Settlement | null,
  players: Player[],
): Tribe | null {
  if (!settlement || settlement.owner === null) return null;
  const player = players[settlement.owner];
  return player ? player.tribe : null;
}

export function villageTextureFor(
  settlement: Settlement | null,
  textures: VillageTextureSet,
  tribe: Tribe | null,
): { texture: Texture | null; anchorY: number } {
  if (!settlement) return { texture: null, anchorY: 0.5 };
  if (settlement.owner === null) {
    return { texture: textures.freeVillageTexture.texture, anchorY: textures.freeVillageTexture.anchorY };
  }
  const ownerTribe = tribe ?? Tribe.Villagers;
  const v = settlement.level >= 2
    ? textures.villageTextures[ownerTribe].level2
    : textures.villageTextures[ownerTribe].level1;
  return { texture: v.texture, anchorY: v.anchorY };
}