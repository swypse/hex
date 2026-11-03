import { claimTileForVillage } from './claim';
import { exploreAround } from '../map/explore';
import { hexDistance, hexNeighbors } from '../map/hex';
import type { Resources } from './resources';
import { canAffordAt, payAt } from './stock';
import { hasSkill } from '../skills';
import type { Player } from '../players';
import { type GameMap, type MapTile, type Settlement, type SettlementBuild } from '../map/map-gen';
import { tileAt } from '../map/tile-index';
import { isIceType, isWaterType } from '../map/tile-types';
import { makeUnit, unitMaxHp, VETERAN_KILLS, type Unit } from '../units/units';
import { villageColumnMiddleCount } from './village-build';
import { BuildingKind, SkillId, UnitType, VillageBlockVariant, VillageBuildSide, VillageUpgradeBonus } from '@enums';

export const WALL_COST: Resources = { money: 20, wood: 0, stone: 15, ore: 5, food: 0 };

export function canBuildWall(map: GameMap, tile: MapTile, player: Player): boolean {
  const s = tile.settlement;
  if (!s || s.owner !== player.index || s.wall) return false;
  if (!hasSkill(player, SkillId.DEFENSE)) return false;
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
  if (level >= 10) return 4;
  if (level >= 5) return 3;
  return level === 1 ? 1 : 2;
}

/** Territory radius of a village: its recorded radius, or (old saves) the one its level used to give. */
export function settlementRadius(settlement: Pick<Settlement, 'radius' | 'level'>): number {
  return settlement.radius ?? claimRadius(settlement.level);
}

/** The level a village's income is paid for: never above its level. */
export function settlementIncomeLevel(settlement: Pick<Settlement, 'incomeLevel' | 'level'>): number {
  return Math.min(settlement.incomeLevel ?? settlement.level, settlement.level);
}

/** Fog-sight radius of a village: its territory radius plus a one-hex ring. */
export function villageSightRadius(level: number): number {
  return claimRadius(level) + 1;
}

/** Reveals the tiles within a village's sight radius for the player. */
export function exploreVillageSight(map: GameMap, villageTile: MapTile, playerIndex: number): MapTile[] {
  const radius = villageTile.settlement ? settlementRadius(villageTile.settlement) : 1;
  return exploreAround(map, villageTile, radius + 1, playerIndex);
}

/** Upgrade levels (from-level) at which the player picks the bonus. */
export const UPGRADE_CHOICE_EXPAND_FROM = 5;
export const UPGRADE_CHOICE_VETERAN_FROM = 9;
export const UPGRADE_CHOICE_INCOME_FROM = 10;
/** Money granted by the money bonus. */
export const UPGRADE_MONEY_BONUS = 5;

/** The bonuses on offer when upgrading a village of this level (empty: the upgrade has no choice).
 *  5→6: territory or money; 9→10: territory or a veteran swordsman; 10 and up: income or a veteran swordsman. */
export function villageUpgradeChoices(level: number): VillageUpgradeBonus[] {
  if (level === UPGRADE_CHOICE_EXPAND_FROM) return [VillageUpgradeBonus.EXPAND_TERRITORY, VillageUpgradeBonus.MONEY];
  if (level === UPGRADE_CHOICE_VETERAN_FROM) return [VillageUpgradeBonus.EXPAND_TERRITORY, VillageUpgradeBonus.VETERAN_SWORDSMAN];
  if (level >= UPGRADE_CHOICE_INCOME_FROM) return [VillageUpgradeBonus.INCOME, VillageUpgradeBonus.VETERAN_SWORDSMAN];
  return [];
}

/** True when a land enemy stands on the village or close to it: the moment to take the swordsman. */
export function villageUnderThreat(map: GameMap, villageTile: MapTile): boolean {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return false;
  if (villageTile.unit && villageTile.unit.owner !== owner) return true;
  return map.tiles.some((t) => t.unit && t.unit.owner !== owner && t.unit.owner >= 0 && t.unit.shipLevel === undefined && hexDistance(t, villageTile) <= 3);
}

/** What the AI takes when it upgrades: the swordsman under threat, otherwise territory or income. */
export function aiUpgradeBonus(map: GameMap, villageTile: MapTile): VillageUpgradeBonus | undefined {
  const choices = villageUpgradeChoices(villageTile.settlement?.level ?? 1);
  if (choices.length === 0) return undefined;
  if (choices.includes(VillageUpgradeBonus.VETERAN_SWORDSMAN) && villageUnderThreat(map, villageTile)) return VillageUpgradeBonus.VETERAN_SWORDSMAN;
  return choices[0];
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

/** What an upgrade did besides raising the level. */
export interface VillageUpgradeResult {
  bonus: VillageUpgradeBonus | null;
  /** Money the owner is owed (the money bonus). */
  money: number;
  /** The veteran swordsman raised on the village. */
  spawned: Unit | null;
  /** The unit that stood on the village and was pushed to an adjacent free cell. */
  displaced: Unit | null;
  /** The unit that stood on the village and had nowhere to go: it is gone. */
  removed: Unit | null;
}

let veteranSeq = 0;

/** Puts a veteran swordsman on the village for free, no skill needed. A unit
 *  standing there steps to an adjacent free land cell, or is lost when there
 *  is none; an enemy pushed off also loses its capture progress. */
function raiseVeteranSwordsman(map: GameMap, tile: MapTile, owner: number): Pick<VillageUpgradeResult, 'spawned' | 'displaced' | 'removed'> {
  let displaced: Unit | null = null;
  let removed: Unit | null = null;
  const standing = tile.unit;
  if (standing) {
    const free = hexNeighbors(tile)
      .map((n) => tileAt(map, n.q, n.r))
      .find((t): t is MapTile => !!t && !t.unit && !t.settlement && !isWaterType(t.terrain) && !isIceType(t.terrain));
    if (free) {
      free.unit = standing;
      standing.q = free.q;
      standing.r = free.r;
      displaced = standing;
    } else {
      removed = standing;
    }
    tile.unit = null;
    if (standing.owner !== owner && tile.settlement) tile.settlement.captureReady = false;
  }
  const unit = makeUnit(owner, UnitType.SWORDSMAN, tile.q, tile.r, {
    id: `veteran-${Date.now()}-${veteranSeq++}`,
    hasMoved: true,
    hasAttacked: true,
    hasHealed: true,
    spawnVillage: { q: tile.q, r: tile.r },
  });
  unit.veteran = true;
  unit.kills = VETERAN_KILLS;
  unit.hp = unitMaxHp(unit);
  tile.unit = unit;
  return { spawned: unit, displaced, removed };
}

/** Raises the village one level. `bonus` is the player's pick on the levels that offer one
 *  (see `villageUpgradeChoices`); a missing or invalid pick takes the first option. */
export function upgradeVillage(map: GameMap, tile: MapTile, roll: () => number = Math.random, bonus?: VillageUpgradeBonus): VillageUpgradeResult {
  const result: VillageUpgradeResult = { bonus: null, money: 0, spawned: null, displaced: null, removed: null };
  const settlement = tile.settlement;
  if (!settlement || settlement.owner === null) return result;
  const from = settlement.level;
  const choices = villageUpgradeChoices(from);
  const pick = choices.length === 0 ? null : (bonus !== undefined && choices.includes(bonus) ? bonus : choices[0]!);
  result.bonus = pick;

  let radius = settlementRadius(settlement);
  let incomeLevel = settlementIncomeLevel(settlement);
  settlement.level++;
  // Income follows the level, except where a veteran swordsman was taken instead of the raise.
  if (!(from >= UPGRADE_CHOICE_INCOME_FROM && pick === VillageUpgradeBonus.VETERAN_SWORDSMAN)) incomeLevel++;
  if (from === 1) radius = Math.max(radius, 2);
  if (pick === VillageUpgradeBonus.EXPAND_TERRITORY) radius++;
  settlement.radius = radius;
  settlement.incomeLevel = incomeLevel;
  if (pick === VillageUpgradeBonus.MONEY) result.money = UPGRADE_MONEY_BONUS;

  const build: SettlementBuild = settlement.build ??= {
    l: [[], [], []],
    r: [[], []],
    lBack: [[], []],
    rBack: [[]],
  };
  const pickBlock = (): VillageBlockVariant => (
    [VillageBlockVariant.M1, VillageBlockVariant.M2, VillageBlockVariant.M3, VillageBlockVariant.M4] as VillageBlockVariant[]
  )[Math.min(3, Math.floor(roll() * 4))]!;
  // Each column carries its own per-level block count (see village-build.ts);
  // top up only ever appends, so pre-existing records stay valid.
  const topUp = (columns: VillageBlockVariant[][], side: VillageBuildSide): void => {
    columns.forEach((column, i) => {
      while (column.length < villageColumnMiddleCount(side, i, settlement.level)) column.push(pickBlock());
    });
  };
  topUp(build.l, VillageBuildSide.LEFT);
  topUp(build.r, VillageBuildSide.RIGHT);
  topUp(build.lBack ??= [[], []], VillageBuildSide.LEFT_BACK);
  topUp(build.rBack ??= [[]], VillageBuildSide.RIGHT_BACK);
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    claimTileForVillage(t, tile);
  }
  exploreVillageSight(map, tile, settlement.owner);
  if (pick === VillageUpgradeBonus.VETERAN_SWORDSMAN) Object.assign(result, raiseVeteranSwordsman(map, tile, settlement.owner));
  return result;
}

/** Units a village can hold: 2 at level 1, +1 for every second level (lvl 2 → 3, lvl 4 → 4, lvl 6 → 5). */
export function villageCapacity(level: number): number {
  return 2 + Math.floor(level / 2);
}

/** How many buildings a village of this level may support. */
export function villageBuildingLimit(level: number): number {
  return level;
}

/** Kinds of the buildings that use a slot of the given village (claimed by it). */
export function buildingKindsInVillage(map: GameMap, villageTile: MapTile): BuildingKind[] {
  const villageKey = `${villageTile.q},${villageTile.r}`;
  const kinds: BuildingKind[] = [];
  for (const t of map.tiles) {
    if (!t.building || !t.claimedByVillage) continue;
    // Farms and granaries are land improvements: they never use a building slot.
    if (t.building.kind === BuildingKind.FARM || t.building.kind === BuildingKind.GRANARY) continue;
    if (`${t.claimedByVillage.q},${t.claimedByVillage.r}` === villageKey) kinds.push(t.building.kind);
  }
  return kinds;
}

/** Number of buildings on tiles claimed by the given village. */
export function buildingsInVillage(map: GameMap, villageTile: MapTile): number {
  return buildingKindsInVillage(map, villageTile).length;
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

/** Keys (`q,r`) of the villages that have a university on the tiles they claim. */
export function universityVillageKeys(map: GameMap): Set<string> {
  const keys = new Set<string>();
  for (const t of map.tiles) {
    if (t.building?.kind === BuildingKind.UNIVERSITY && t.claimedByVillage) keys.add(`${t.claimedByVillage.q},${t.claimedByVillage.r}`);
  }
  return keys;
}

/** Whether `tile` belongs to a village that has a university: it is claimed by
 *  one, or is the village's own tile. */
export function tileHasUniversity(map: Pick<GameMap, 'tiles'>, tile: Pick<MapTile, 'claimedByVillage' | 'q' | 'r' | 'settlement'>): boolean {
  const c = tile.claimedByVillage ?? (tile.settlement ? { q: tile.q, r: tile.r } : null);
  if (!c) return false;
  return map.tiles.some((t) => t.building?.kind === BuildingKind.UNIVERSITY && t.claimedByVillage?.q === c.q && t.claimedByVillage.r === c.r);
}
