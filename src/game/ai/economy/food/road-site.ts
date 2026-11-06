import { BuildingKind } from '@enums';
import type { Resources } from '../../../economy/resources';
import type { MapTile } from '../../../map/map-gen';
import { isWaterType } from '../../../map/tile-types';

/** Rough price of a bundle of resources, to compare a farm to a road or port. */
export function weigh(cost: Resources): number {
  return cost.money + cost.wood * 2 + cost.stone * 3;
}

/** Whether a new road could be laid on `tile` (terrain and ownership only). */
export function roadSite(tile: MapTile, owner: number): boolean {
  if (tile.roadOwner !== null && tile.roadOwner !== undefined) return false;
  if (tile.ownedBy !== null && tile.ownedBy !== owner) return false;
  if (isWaterType(tile.terrain) || tile.settlement !== null) return false;
  if (tile.building !== null && tile.building.kind === BuildingKind.PORT) return false;
  return !(tile.unit && tile.unit.owner !== owner);
}
