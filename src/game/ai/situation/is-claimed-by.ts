import type { MapTile } from '../../map/map-gen';

/** Whether `tile` belongs to the territory of the village on `village`. */
export function isClaimedBy(tile: MapTile, village: { q: number; r: number }): boolean {
  return tile.claimedByVillage != null && tile.claimedByVillage.q === village.q && tile.claimedByVillage.r === village.r;
}
