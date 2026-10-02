import { claimTileForVillage } from './claim';
import { exploreAround } from './explore';
import { hexDistance } from './hex';
import type { Resources } from './resources';
import { canAffordAt, payAt } from './stock';
import { hasSkill } from './skills';
import type { Player } from './players';
import { GameMap, MapTile, SettlementBuild, VillageBlockVariant } from './map-gen';
import { villageColumnMiddleCount, VillageBuildSide } from './village-build';

export const WALL_COST: Resources = { money: 20, wood: 0, stone: 15, ore: 5, food: 0 };

export function canBuildWall(map: GameMap, tile: MapTile, player: Player): boolean {
  const s = tile.settlement;
  if (!s || s.owner !== player.index || s.wall) return false;
  if (!hasSkill(player, 'defense')) return false;
  return canAffordAt(map, player, tile, WALL_COST);
}

export function buildWall(map: GameMap, tile: MapTile, player: Player): boolean {
  const s = tile.settlement;
  if (!canBuildWall(map, tile, player) || !s) return false;
  if (!payAt(map, player, tile, WALL_COST)) return false;
  s.wall = true;
  return true;
}

export function claimRadius(level: number): number {
  if (level >= 5) return 3;
  return level === 1 ? 1 : 2;
}

/** Fog-sight radius of a village: its territory radius plus a one-hex ring. */
export function villageSightRadius(level: number): number {
  return claimRadius(level) + 1;
}

/** Reveals the tiles within a village's sight radius for the player. */
export function exploreVillageSight(map: GameMap, villageTile: MapTile, playerIndex: number): MapTile[] {
  const level = villageTile.settlement?.level ?? 1;
  return exploreAround(map, villageTile, villageSightRadius(level), playerIndex);
}

/** Reveals every owned village's sight radius for the player (game start). */
export function exploreVillageSights(map: GameMap, playerIndex: number): void {
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner === playerIndex) exploreVillageSight(map, t, playerIndex);
  }
}

export function ownedTilesFor(map: GameMap, tile: MapTile): MapTile[] {
  const owner = tile.settlement!.owner;
  return map.tiles.filter((t) => t.ownedBy === owner);
}

export function upgradeVillage(map: GameMap, tile: MapTile, roll: () => number = Math.random): void {
  const settlement = tile.settlement;
  if (!settlement || settlement.owner === null) return;
  settlement.level++;
  const build: SettlementBuild = settlement.build ??= {
    l: [[], [], []],
    r: [[], []],
    lBack: [[], []],
    rBack: [[]],
  };
  const pick = (): VillageBlockVariant => (
    ['m1', 'm2', 'm3', 'm4'] as VillageBlockVariant[]
  )[Math.min(3, Math.floor(roll() * 4))]!;
  // Each column carries its own per-level block count (see village-build.ts);
  // top up only ever appends, so pre-existing records stay valid.
  const topUp = (columns: VillageBlockVariant[][], side: VillageBuildSide): void => {
    columns.forEach((column, i) => {
      while (column.length < villageColumnMiddleCount(side, i, settlement.level)) column.push(pick());
    });
  };
  topUp(build.l, 'l');
  topUp(build.r, 'r');
  topUp(build.lBack ??= [[], []], 'lBack');
  topUp(build.rBack ??= [[]], 'rBack');
  const radius = claimRadius(settlement.level);
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    claimTileForVillage(t, tile);
  }
  exploreVillageSight(map, tile, settlement.owner);
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
    // Farms and granaries are land improvements: they never use a building slot.
    if (t.building.kind === 'farm' || t.building.kind === 'granary') continue;
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
