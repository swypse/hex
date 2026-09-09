import { GameMap, MapTile } from './mapGen';
import { Unit, unitMaintenance } from './units';
import { villageCapacity, unitsInVillage, exploreVillageSight } from './village';

export function setCaptureReady(villageTile: MapTile, ready: boolean): void {
  if (villageTile.settlement) {
    villageTile.settlement.captureReady = ready;
  }
}

/** Money upkeep of all units this village raised (owner's units whose
 *  spawnVillage is this village), used against the village's income. */
export function villageMaintenance(map: GameMap, villageTile: MapTile): number {
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

export function villageIncome(map: GameMap, villageTile: MapTile): number {
  const level = villageTile.settlement!.level;
  const base = 3 + level * 2;
  return Math.max(0, base - villageMaintenance(map, villageTile));
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
      t.ownedBy = capturer.owner;
    }
  }

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
