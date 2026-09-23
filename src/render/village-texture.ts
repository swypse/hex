import type { Texture } from 'pixi.js';
import { Tribe } from '../game/tribes';
import type { Settlement } from '../game/map-gen';
import type { Player } from '../game/players';
import type { TileTexture } from './texture-factory';
import type { VillageBuildTextureService } from './village-build-texture';

interface VillageTextureSet {
  /** The generic free/unowned village texture. */
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
  villageBuilds?: Partial<Record<Tribe, VillageBuildTextureService>> | null,
): { texture: Texture | null; anchorY: number } {
  if (!settlement) return { texture: null, anchorY: 0.5 };
  if (settlement.owner === null) {
    return { texture: textures.freeVillageTexture.texture, anchorY: textures.freeVillageTexture.anchorY };
  }
  const ownerTribe = tribe ?? Tribe.Villagers;
  const composite = villageBuilds?.[ownerTribe];
  if (composite) {
    const built = composite.tileTexture(settlement);
    if (built) return built;
  }
  return { texture: textures.freeVillageTexture.texture, anchorY: textures.freeVillageTexture.anchorY };
}