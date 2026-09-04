import { claimTileForVillage } from './claim';
import { exploreVillageTiles } from './explore';
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';

export function claimRadius(level: number): number {
  return level === 1 ? 1 : 2;
}

export function ownedTilesFor(map: GameMap, tile: MapTile): MapTile[] {
  const owner = tile.settlement!.owner;
  return map.tiles.filter((t) => t.ownedBy === owner);
}

export function upgradeVillage(map: GameMap, tile: MapTile): void {
  const settlement = tile.settlement;
  if (!settlement || settlement.owner === null) return;
  settlement.level++;
  const radius = claimRadius(settlement.level);
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    claimTileForVillage(t, tile);
  }
  exploreVillageTiles(map, tile, settlement.owner);
}

export function villageCapacity(level: number): number {
  return 1 + level;
}

/** How many buildings a village of this level may support (1 at level 1). */
export function villageBuildingLimit(level: number): number {
  if (level >= 4) return 4;
  if (level === 3) return 3;
  return level === 2 ? 2 : 1;
}

/** Number of buildings on tiles claimed by the given village. */
export function buildingsInVillage(map: GameMap, villageTile: MapTile): number {
  const villageKey = `${villageTile.q},${villageTile.r}`;
  let count = 0;
  for (const t of map.tiles) {
    if (!t.building || !t.claimedByVillage) continue;
    if (`${t.claimedByVillage.q},${t.claimedByVillage.r}` === villageKey) count++;
  }
  return count;
}

export function unitsInVillage(map: GameMap, villageTile: MapTile): number {
  const villageKey = `${villageTile.q},${villageTile.r}`;
  let count = 0;
  for (const t of map.tiles) {
    if (!t.unit) continue;
    const sv = t.unit.spawnVillage;
    if (sv && `${sv.q},${sv.r}` === villageKey) count++;
  }
  return count;
}
