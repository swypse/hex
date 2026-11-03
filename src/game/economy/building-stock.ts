import type { Building } from '../map/map-gen';
import { BuildingKind } from '@enums';

/** The materials a producing building can hold. */
export type BuildingMaterial = 'wood' | 'stone' | 'ore';

export const BUILDING_MATERIALS: readonly BuildingMaterial[] = ['wood', 'stone', 'ore'];

/** Most each producing building holds of each material: a sawmill 20 wood, a
 *  mine 20 stone and 20 ore. A full building stops collecting. */
export const BUILDING_STOCK_CAPACITY: Partial<Record<BuildingKind, Partial<Record<BuildingMaterial, number>>>> = {
  [BuildingKind.SAWMILL]: { wood: 20 },
  [BuildingKind.MINE]: { stone: 20, ore: 20 },
};

/** Whether buildings of this kind hold materials. */
export function holdsMaterials(kind: BuildingKind): boolean {
  return BUILDING_STOCK_CAPACITY[kind] !== undefined;
}

/** How much of `material` this building can hold at most (0 when it holds none). */
export function buildingCapacity(building: Pick<Building, 'kind'>, material: BuildingMaterial): number {
  return BUILDING_STOCK_CAPACITY[building.kind]?.[material] ?? 0;
}

/** What the building currently holds of `material`. */
export function heldInBuilding(building: Building, material: BuildingMaterial): number {
  return building[material] ?? 0;
}

/** Room left for `material`. */
export function roomInBuilding(building: Building, material: BuildingMaterial): number {
  return Math.max(0, buildingCapacity(building, material) - heldInBuilding(building, material));
}
