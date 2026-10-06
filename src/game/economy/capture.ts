import { type GameMap, type MapTile } from '../map/map-gen';
import { type Unit, unitMaintenance } from '../units/units';
import { villageCapacity, unitsInVillage, exploreVillageSight } from './village';
import { isVillageRoadConnected } from './roads';
import { START_STOCK } from './resources';
import { payerVillage, readStock, stockOf } from './stock';
import { BuildingKind } from '@enums';

export function setCaptureReady(villageTile: MapTile, ready: boolean): void {
  if (villageTile.settlement) {
    villageTile.settlement.captureReady = ready;
  }
}

/** Extra money income per turn for a village connected to another own village. */
export const VILLAGE_CONNECTION_BONUS = 1;

/** Money upkeep of all units this village raised (owner's units whose
 *  spawnVillage is this village), used against the village's income. */
function villageMaintenance(map: GameMap, villageTile: MapTile): number {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return 0;
  let upkeep = 0;
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== owner) continue;
    const sv = unit.spawnVillage;
    if (!sv) continue;
    if (sv.q === villageTile.q && sv.r === villageTile.r) {
      upkeep += unitMaintenance(unit);
    }
  }
  return upkeep;
}

/** Money per turn each road tile and each sawmill, farm, granary and mine costs its village. */
const STRUCTURE_UPKEEP = 1;

const UPKEEP_BUILDINGS: readonly BuildingKind[] = [BuildingKind.SAWMILL, BuildingKind.FARM, BuildingKind.GRANARY, BuildingKind.MINE];

/** Money upkeep of what stands on `tile`: a road and/or a sawmill, farm, granary or mine. */
export function tileUpkeep(tile: MapTile): number {
  const road = tile.roadOwner !== null && tile.roadOwner !== undefined ? 1 : 0;
  const building = tile.building && UPKEEP_BUILDINGS.includes(tile.building.kind) ? 1 : 0;
  return (road + building) * STRUCTURE_UPKEEP;
}

/** Money upkeep of the roads and buildings paid by this village (see payerVillage). */
export function villageStructureUpkeep(map: GameMap, villageTile: MapTile): number {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return 0;
  let upkeep = 0;
  for (const t of map.tiles) {
    const cost = tileUpkeep(t);
    if (cost === 0) continue;
    const payer = payerVillage(map, t.roadOwner ?? t.ownedBy ?? owner, t);
    if (payer === villageTile) upkeep += cost;
  }
  return upkeep;
}

/** True when a hostile unit currently stands on the village tile, blocking
 *  its money income and the income of buildings on its territory. */
export function villageEnemyOccupied(villageTile: MapTile): boolean {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return false;
  const u = villageTile.unit;
  return u !== null && u.owner !== owner;
}

export interface VillageIncomeBreakdown {
  /** 3 + 2 × level, before any upkeep. */
  raw: number;
  /** Upkeep of the units the village raised. */
  units: number;
  /** Upkeep of the roads and buildings the village pays for. */
  structures: number;
  /** Bonus for being road-connected to another own village. */
  connection: number;
  /** What the village pays into the treasury each turn. */
  total: number;
}

export function villageIncomeBreakdown(map: GameMap, villageTile: MapTile): VillageIncomeBreakdown {
  const raw = 3 + villageTile.settlement!.level * 2;
  const units = villageMaintenance(map, villageTile);
  const structures = villageStructureUpkeep(map, villageTile);
  const connection = isVillageRoadConnected(map, villageTile) ? VILLAGE_CONNECTION_BONUS : 0;
  const total = villageEnemyOccupied(villageTile) ? 0 : Math.max(0, raw - units - structures) + connection;
  return { raw, units, structures, connection, total };
}

export function villageIncome(map: GameMap, villageTile: MapTile): number {
  return villageIncomeBreakdown(map, villageTile).total;
}

export function villageIncomeTotal(map: GameMap, playerIndex: number): number {
  let income = 0;
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner === playerIndex) {
      income += villageIncome(map, t);
    }
  }
  return income;
}

export function captureVillage(
  map: GameMap,
  villageTile: MapTile,
  capturer: Unit,
): { ownerDied: boolean } {
  const settlement = villageTile.settlement!;
  const oldOwner = settlement.owner;
  if (oldOwner === capturer.owner) return { ownerDied: false };
  if (!settlement.captureReady) return { ownerDied: false };

  capturer.hasMoved = true;
  capturer.hasAttacked = true;
  capturer.hasHealed = true;

  settlement.owner = capturer.owner;
  settlement.captureReady = false;
  villageTile.ownedBy = capturer.owner;
  villageTile.claimedByVillage = { q: villageTile.q, r: villageTile.r };
  capturer.spawnVillage = { q: villageTile.q, r: villageTile.r };

  for (const t of map.tiles) {
    if (
      t.claimedByVillage &&
      t.claimedByVillage.q === villageTile.q &&
      t.claimedByVillage.r === villageTile.r
    ) {
      // The village's stock and the food in its granaries go to the captor.
      t.ownedBy = capturer.owner;
    }
  }

  // A village captured with nothing in stock starts like a capital (no money).
  const held = readStock(villageTile);
  if (Object.values(held).every((n) => n === 0)) Object.assign(stockOf(villageTile), START_STOCK);

  exploreVillageSight(map, villageTile, capturer.owner);

  const redistributable = map.tiles.filter(
    (t) => t.settlement && t.settlement.owner === oldOwner,
  );

  if (oldOwner !== null) {
    const displaced = map.tiles.filter(
      (t) =>
        t.unit &&
        t.unit.owner === oldOwner &&
        t.unit.spawnVillage &&
        t.unit.spawnVillage.q === villageTile.q &&
        t.unit.spawnVillage.r === villageTile.r &&
        t.unit.id !== capturer.id,
    );

    if (redistributable.length === 0) {
      for (const t of map.tiles) {
        if (t.unit && t.unit.owner === oldOwner) {
          t.unit = null;
        }
      }
      return { ownerDied: true };
    }

    const sorted = [...redistributable].sort(
      (a, b) => unitsInVillage(map, a) - unitsInVillage(map, b),
    );
    for (const unitTile of displaced) {
      let placed = false;
      for (const village of sorted) {
        if (unitsInVillage(map, village) < villageCapacity(village.settlement!.level)) {
          unitTile.unit!.spawnVillage = { q: village.q, r: village.r };
          placed = true;
          break;
        }
      }
      if (!placed && sorted.length > 0) {
        const fallback = sorted[0]!;
        unitTile.unit!.spawnVillage = { q: fallback.q, r: fallback.r };
      }
    }
  }

  return { ownerDied: false };
}
