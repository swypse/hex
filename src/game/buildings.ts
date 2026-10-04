import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { moneyCost, Resources } from './resources';
import { canAffordAt, payAt, payerVillage, villagesJoinedBy, villageNetwork } from './stock';
import { hasSkill } from './skills';
import { isForestType, isLandType, isMountainType, isSolidGround, isWaterType } from './tile-types';
import { buildingsInVillage, villageBuildingLimit } from './village';
import { villageEnemyOccupied } from './capture';
import type { Unit } from './units';
import { t } from '../i18n';
import { canBuildBridgeHere, BRIDGE_COST } from './bridges';
import { BuilderExtraKind, BuildingKind, PortDirection, SkillId } from '@enums';
import { droughtOverTile, halvedYield } from './weather';

export type BuilderBuildKind = BuildingKind | BuilderExtraKind;
/** The structures a builder unit can place from its build menu. */
export type BuilderBuildableKind = BuildingKind.SAWMILL | BuildingKind.MINE | BuildingKind.PORT | BuilderExtraKind.BRIDGE;

export const BUILDER_KINDS: BuilderBuildableKind[] = [BuildingKind.SAWMILL, BuildingKind.MINE, BuildingKind.PORT, BuilderExtraKind.BRIDGE];

export const SAWMILL_COST = 10;
export const MINE_COST = 15;

/** Maximum hp of every building (catapult siege deals 1 per hit). */
export const BUILDING_MAX_HP = 2;
/** Repairing a damaged building to full hp. */
export const REPAIR_COST: Resources = { wood: 2, stone: 2, ore: 2, money: 3, food: 0 };

/** A building's current hp; `undefined` (new/undamaged) reads as full. */
export function buildingHp(building: { hp?: number } | null | undefined): number {
  return building?.hp ?? BUILDING_MAX_HP;
}



/** The village whose territory claims this tile, or null when unclaimed. */
function claimingVillageFor(map: GameMap, tile: MapTile): MapTile | null {
  const c = tile.claimedByVillage;
  if (!c) return null;
  return map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement) ?? null;
}

/** Whether the claiming village still has room for another building. Tiles not
 * claimed by any village (possible only in synthetic maps) are not limited. */
function villageHasBuildingSlot(map: GameMap, tile: MapTile, player: Player): boolean {
  const village = claimingVillageFor(map, tile);
  if (!village?.settlement) return true;
  if (village.settlement.owner !== player.index) return false;
  return buildingsInVillage(map, village) < villageBuildingLimit(village.settlement.level);
}

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  sawmill: t('building.sawmill'),
  mine: t('building.mine'),
  port: t('building.port'),
  temple: t('building.temple'),
  forestTemple: t('building.forestTemple'),
  farm: t('building.farm'),
  granary: t('building.granary'),
};

export const BUILDING_COSTS: Record<BuildingKind, Resources> = {
  sawmill: moneyCost(SAWMILL_COST),
  mine: moneyCost(MINE_COST),
  port: { wood: 10, stone: 0, money: 30, ore: 2, food: 0 },
  temple: { wood: 0, stone: 10, money: 30, ore: 0, food: 0 },
  forestTemple: { wood: 0, stone: 10, money: 30, ore: 0, food: 0 },
  farm: { wood: 5, stone: 0, money: 15, ore: 0, food: 0 },
  granary: { wood: 10, stone: 10, money: 20, ore: 0, food: 0 },
};

/** Spawn costs for every kind a builder (Villagers special unit) may construct,
 *  keyed by that kind. */
export const BUILDER_BUILD_COSTS: Record<BuilderBuildableKind, Resources> = {
  sawmill: BUILDING_COSTS.sawmill,
  mine: BUILDING_COSTS.mine,
  port: BUILDING_COSTS.port,
  bridge: BRIDGE_COST,
};

/** Whether the given resources cover at least one builder-constructable kind. */
export function canAffordAnyBuilderBuild(map: GameMap, player: Player, tile: MapTile): boolean {
  return BUILDER_KINDS.some((kind) => canAffordAt(map, player, tile, BUILDER_BUILD_COSTS[kind]));
}

function neighborTile(map: GameMap, n: { q: number; r: number }): MapTile | undefined {
  return map.tiles.find((t) => t.q === n.q && t.r === n.r);
}

export function canBuildSawmill(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.FORESTRY)) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!isLandType(tile.terrain)) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && isForestType(t.terrain);
  });
}

export function canBuildMine(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.SMITHERY)) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isMountainType(tile.terrain);
}

export function canBuildPort(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.WATER)) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  if (!isWaterType(tile.terrain)) return false;
  // A port must sit on the player's own coast so a land unit can reach and
  // board it; a water tile in the middle of a lake or at the map edge cannot.
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && t.ownedBy === player.index && isSolidGround(t.terrain);
  });
}

export function canBuildTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.WATER_TEMPLES)) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isWaterType(tile.terrain);
}

export function canBuildForestTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.FOREST_TEMPLE)) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isForestType(tile.terrain);
}

/** A food building's shared placement rule: an own, empty land tile (no
 *  forest/mountain/water; a road is fine) with no enemy unit standing on it.
 *  Food buildings do not use up a village building slot. */
export function canPlaceFoodBuilding(tile: MapTile, player: Player): boolean {
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!isLandType(tile.terrain)) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.unit && tile.unit.owner !== player.index) return false;
  return true;
}

export function canBuildFarm(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.AGRICULTURE)) return false;
  return canPlaceFoodBuilding(tile, player);
}

/** A granary must stand next to one of the player's farms. */
export function canBuildGranary(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, SkillId.GRANARY)) return false;
  if (!canPlaceFoodBuilding(tile, player)) return false;
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && t.building?.kind === BuildingKind.FARM && t.ownedBy === player.index;
  });
}

export function isFoodBuilding(building: { kind: BuildingKind } | null | undefined): boolean {
  return building?.kind === BuildingKind.FARM || building?.kind === BuildingKind.GRANARY;
}

/** Whether `unit`, standing on an enemy farm or granary, may burn it: the unit
 *  must not have attacked or healed yet (moving onto the tile is fine). */
export function canBurnBuilding(tile: MapTile, unit: Unit): boolean {
  if (tile.unit !== unit) return false;
  if (!isFoodBuilding(tile.building)) return false;
  if (tile.ownedBy === null || tile.ownedBy === undefined || tile.ownedBy === unit.owner) return false;
  if (unit.owner < 0 || unit.shipLevel !== undefined) return false;
  if (unit.hasAttacked || unit.hasHealed) return false;
  return (unit.stunTurns ?? 0) < 1;
}

/** Whether `unit` may destroy the enemy road it stands on: it must not have
 *  moved, attacked or healed this turn (the action takes the whole turn), and a
 *  burnable enemy food building on the tile has to go first. */
export function canBurnRoad(tile: MapTile, unit: Unit): boolean {
  if (tile.unit !== unit) return false;
  if (tile.roadOwner === null || tile.roadOwner === undefined || tile.roadOwner === unit.owner) return false;
  if (unit.owner < 0 || unit.shipLevel !== undefined) return false;
  if (unit.hasMoved || unit.hasAttacked || unit.hasHealed) return false;
  if ((unit.stunTurns ?? 0) >= 1) return false;
  const foodFirst = isFoodBuilding(tile.building) && tile.ownedBy !== null && tile.ownedBy !== undefined && tile.ownedBy !== unit.owner;
  return !foodFirst;
}

/** Destroys the road (and a bridge carrying it) under the unit and spends its
 *  whole turn. */
export function burnRoad(tile: MapTile, unit: Unit): boolean {
  if (!canBurnRoad(tile, unit)) return false;
  tile.roadOwner = null;
  tile.bridge = null;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  unit.hasHealed = true;
  return true;
}

/** Destroys the food building under the unit and spends its whole turn. */
export function burnBuilding(tile: MapTile, unit: Unit): boolean {
  if (!canBurnBuilding(tile, unit)) return false;
  tile.building = null;
  unit.hasMoved = true;
  unit.hasAttacked = true;
  unit.hasHealed = true;
  return true;
}

/** Placement rule for a building kind with the skill check skipped — exactly
 *  what the Villagers builder uses: terrain/territory/slot rules unchanged,
 *  no skill required. */
export function canBuildKindIgnoringSkill(
  kind: BuildingKind,
  map: GameMap,
  tile: MapTile,
  player: Player,
): boolean {
  if (kind === BuildingKind.TEMPLE || kind === BuildingKind.FOREST_TEMPLE || kind === BuildingKind.FARM || kind === BuildingKind.GRANARY) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  if (kind === BuildingKind.MINE) {
    return isMountainType(tile.terrain);
  }
  if (kind === BuildingKind.PORT) {
    if (tile.bridge !== undefined && tile.bridge !== null) return false;
    if (!isWaterType(tile.terrain)) return false;
    return hexNeighbors(tile).some((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && t.ownedBy === player.index && isSolidGround(t.terrain);
    });
  }
  // sawmill
  if (!isLandType(tile.terrain)) return false;
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && isForestType(t.terrain);
  });
}

/** Cells the builder standing on `tile` may build `kind` on: its own tile and
 *  adjacent tiles, owned by the player and passing the kind's placement rules
 *  with the skill requirement waived. */
export function builderBuildable(map: GameMap, tile: MapTile, kind: BuilderBuildKind, player: Player): MapTile[] {
  const out: MapTile[] = [];
  const consider = (t: MapTile | undefined): void => {
    if (!t) return;
    const ok = kind === BuilderExtraKind.BRIDGE
      ? t.ownedBy === player.index && canBuildBridgeHere(map, t)
      : canBuildKindIgnoringSkill(kind as BuildingKind, map, t, player);
    if (ok) out.push(t);
  };
  consider(tile);
  for (const n of hexNeighbors(tile)) consider(neighborTile(map, n));
  return out;
}

/** Whether this player's own building on `tile` is damaged (not full hp). */
export function canRepairBuilding(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!tile.building) return false;
  if (tile.ownedBy !== player.index) return false;
  return buildingHp(tile.building) < BUILDING_MAX_HP;
}

/** Money cost of demolishing one of your own buildings. */
export const DESTROY_BUILDING_COST = 5;

/** Demolishes the player's own building on `tile`, charging
 *  `DESTROY_BUILDING_COST` money and freeing the village's building slot.
 *  Returns true when the demolition happened. */
export function destroyBuilding(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!tile.building) return false;
  if (tile.ownedBy !== player.index) return false;
  if (player.resources.money < DESTROY_BUILDING_COST) return false;
  player.resources.money -= DESTROY_BUILDING_COST;
  tile.building = null;
  return true;
}

/** Repairs a damaged own building to full hp, charging `REPAIR_COST`. Returns
 *  true when the repair happened (validated + affordable). */
export function repairBuilding(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canRepairBuilding(map, tile, player)) return false;
  if (!payAt(map, player, tile, REPAIR_COST)) return false;
  delete tile.building!.hp;
  return true;
}

export function canUsePort(tile: MapTile, player: Player): boolean {
  return tile.building?.kind === BuildingKind.PORT && tile.ownedBy === player.index;
}

const PORT_DIRECTION_VECTORS: { d: PortDirection; o: { q: number; r: number } }[] = [
  { d: PortDirection.E, o: { q: 1, r: 0 } },
  { d: PortDirection.NE, o: { q: 1, r: -1 } },
  { d: PortDirection.NW, o: { q: 0, r: -1 } },
  { d: PortDirection.W, o: { q: -1, r: 0 } },
  { d: PortDirection.SW, o: { q: -1, r: 1 } },
  { d: PortDirection.SE, o: { q: 0, r: 1 } },
];

export function portDirection(map: GameMap, tile: MapTile): PortDirection | null {
  if (tile.building?.kind !== BuildingKind.PORT || tile.ownedBy === null) return null;
  const owner = tile.ownedBy;
  const home = tile.claimedByVillage ? axialKey(tile.claimedByVillage) : null;
  const ownedShore = (n: MapTile): boolean =>
    n.ownedBy === owner && isSolidGround(n.terrain);
  const ownShoreDir = (sameVillageOnly: boolean): PortDirection | null => {
    for (const { d, o } of PORT_DIRECTION_VECTORS) {
      const n = neighborTile(map, { q: tile.q + o.q, r: tile.r + o.r });
      if (!n || !ownedShore(n)) continue;
      if (sameVillageOnly && home !== null) {
        const nHome = n.claimedByVillage ? axialKey(n.claimedByVillage) : null;
        if (nHome !== home) continue;
      }
      return d;
    }
    return null;
  };
  // The dock faces an adjacent shore a unit boards from. Prefer the port
  // owner's adjacent land that belongs to the same village as the port tile;
  // fall back to any of the owner's adjacent land. Foreign or unowned shores
  // and distant villages are never dock targets.
  return ownShoreDir(true) ?? ownShoreDir(false);
}

export function buildBuilding(
  map: GameMap,
  tile: MapTile,
  kind: BuildingKind,
  player: Player,
): boolean {
  const allowed =
    kind === BuildingKind.SAWMILL
      ? canBuildSawmill(map, tile, player)
      : kind === BuildingKind.MINE
        ? canBuildMine(map, tile, player)
        : kind === BuildingKind.PORT
          ? canBuildPort(map, tile, player)
          : kind === BuildingKind.TEMPLE
            ? canBuildTemple(map, tile, player)
            : kind === BuildingKind.FARM
              ? canBuildFarm(map, tile, player)
              : kind === BuildingKind.GRANARY
                ? canBuildGranary(map, tile, player)
                : canBuildForestTemple(map, tile, player);
  if (!allowed) return false;
  return payAndPlaceBuilding(map, tile, kind, player);
}

/** Places a building at its cost without re-validating the skill — used by the
 *  Villagers builder, whose eligibility (terrain/territory/slot) was already
 *  checked by `builderBuildable`. */
export function buildBuildingIgnoringSkill(map: GameMap, tile: MapTile, kind: BuildingKind, player: Player): boolean {
  return payAndPlaceBuilding(map, tile, kind, player);
}

function payAndPlaceBuilding(map: GameMap, tile: MapTile, kind: BuildingKind, player: Player): boolean {
  // A port is a road/water-cluster node: it may be paid by the networks it
  // would join, just like a road or bridge.
  const joined = kind === BuildingKind.PORT ? villagesJoinedBy(map, player.index, tile) : [];
  if (!payAt(map, player, tile, BUILDING_COSTS[kind], joined)) return false;
  tile.building = kind === BuildingKind.GRANARY ? { kind, level: 1, food: 0 } : { kind, level: 1 };
  return true;
}

/** What each producing building of the player yields per round. */
function buildingYields(map: GameMap, player: Player): { tile: MapTile; wood: number; stone: number; ore: number }[] {
  const out: { tile: MapTile; wood: number; stone: number; ore: number }[] = [];
  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index || !tile.building) continue;
    // Buildings on the territory of a village an enemy unit stands on stop
    // producing until the enemy leaves.
    const c = tile.claimedByVillage;
    if (c) {
      const village = neighborTile(map, c);
      if (village && villageEnemyOccupied(village)) continue;
    }
    if (tile.building.kind === BuildingKind.MINE) {
      const bonus = hasSkill(player, SkillId.GEOLOGY) ? 1 : 0;
      // A drought halves a mine's output (never below 1).
      const produced = droughtOverTile(map, tile) ? halvedYield(tile.building.level + bonus) : tile.building.level + bonus;
      out.push({ tile, wood: 0, stone: produced, ore: produced });
      continue;
    }
    if (tile.building.kind === BuildingKind.SAWMILL) {
      const forests = hexNeighbors(tile).filter((n) => {
        const t = neighborTile(map, n);
        return t !== undefined && isForestType(t.terrain);
      }).length;
      out.push({ tile, wood: tile.building.level * forests, stone: 0, ore: 0 });
    }
  }
  return out;
}

/** Materials the player's buildings produce per round, by the village that
 *  receives them (the one claiming the building's tile, else the nearest own
 *  village). */
export function buildingIncomeByVillage(
  map: GameMap,
  player: Player,
): Map<MapTile, { wood: number; stone: number; ore: number }> {
  const out = new Map<MapTile, { wood: number; stone: number; ore: number }>();
  for (const y of buildingYields(map, player)) {
    const village = payerVillage(map, player.index, y.tile);
    if (!village) continue;
    const cur = out.get(village) ?? { wood: 0, stone: 0, ore: 0 };
    cur.wood += y.wood;
    cur.stone += y.stone;
    cur.ore += y.ore;
    out.set(village, cur);
  }
  return out;
}

/** Materials the player's buildings produce per round, all villages together. */
export function buildingIncome(
  map: GameMap,
  player: Player,
): { wood: number; stone: number; ore: number } {
  const total = { wood: 0, stone: 0, ore: 0 };
  for (const y of buildingYields(map, player)) {
    total.wood += y.wood;
    total.stone += y.stone;
    total.ore += y.ore;
  }
  return total;
}

/** Materials produced per round for the network `village` belongs to. */
export function networkBuildingIncome(
  map: GameMap,
  player: Player,
  village: MapTile,
): { wood: number; stone: number; ore: number } {
  const members = new Set(villageNetwork(map, village));
  const total = { wood: 0, stone: 0, ore: 0 };
  for (const [v, inc] of buildingIncomeByVillage(map, player)) {
    if (!members.has(v)) continue;
    total.wood += inc.wood;
    total.stone += inc.stone;
    total.ore += inc.ore;
  }
  return total;
}

export function buildingYield(
  map: GameMap,
  tile: MapTile,
  owner: Player | null,
): { wood: number; stone: number; ore: number } {
  const b = tile.building;
  if (!b) return { wood: 0, stone: 0, ore: 0 };
  if (b.kind === BuildingKind.SAWMILL) {
    const forests = hexNeighbors(tile).filter((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && isForestType(t.terrain);
    }).length;
    return { wood: b.level * forests, stone: 0, ore: 0 };
  }
  if (b.kind === BuildingKind.MINE) {
    const bonus = owner !== null && hasSkill(owner, SkillId.GEOLOGY) ? 1 : 0;
    return { wood: 0, stone: b.level + bonus, ore: b.level + bonus };
  }
  return { wood: 0, stone: 0, ore: 0 };
}
