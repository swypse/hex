import { claimTileForVillage } from './claim';
import { exploreVillageTiles } from './explore';
import { hexDistance } from './hex';
import { canAfford, pay } from './resources';
import { hasSkill } from './skills';
import type { Player } from './players';
import { GameMap, MapTile } from './mapGen';

export const WALL_COST = { money: 20, wood: 0, stone: 15, ore: 5 };

export function canBuildWall(tile: MapTile, player: Player): boolean {
  const s = tile.settlement;
  if (!s || s.owner !== player.index || s.wall) return false;
  if (!hasSkill(player, 'defense')) return false;
  return canAfford(player.resources, WALL_COST);
}

export function buildWall(tile: MapTile, player: Player): boolean {
  const s = tile.settlement;
  if (!canBuildWall(tile, player) || !s) return false;
  player.resources = pay(player.resources, WALL_COST);
  s.wall = true;
  return true;
}

export function claimRadius(level: number): number {
  if (level >= 5) return 3;
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

/** How many buildings a village of this level may support. */
export function villageBuildingLimit(level: number): number {
  return level;
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
