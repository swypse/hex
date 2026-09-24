import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { canAfford, moneyCost, pay, Resources } from './resources';
import { hasSkill } from './skills';
import { isForestType, isLandType, isMountainType, isWaterType } from './tile-types';
import { buildingsInVillage, villageBuildingLimit } from './village';
import { villageEnemyOccupied } from './capture';
import type { BuildingKind } from './events';
import { t } from '../i18n';
import { canBuildBridgeHere } from './bridges';

export type BuilderBuildKind = BuildingKind | 'bridge';
export const BUILDER_KINDS: BuilderBuildKind[] = ['sawmill', 'mine', 'port', 'bridge'];

export const SAWMILL_COST = 10;
export const MINE_COST = 15;

/** Maximum hp of every building (catapult siege deals 1 per hit). */
export const BUILDING_MAX_HP = 2;
/** Repairing a damaged building to full hp. */
export const REPAIR_COST: Resources = { wood: 2, stone: 2, ore: 2, money: 3 };

/** A building's current hp; `undefined` (new/undamaged) reads as full. */
export function buildingHp(building: { hp?: number } | null | undefined): number {
  return building?.hp ?? BUILDING_MAX_HP;
}

export type PortDirection = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w';

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
};

export const BUILDING_COSTS: Record<BuildingKind, Resources> = {
  sawmill: moneyCost(SAWMILL_COST),
  mine: moneyCost(MINE_COST),
  port: { wood: 10, stone: 0, money: 30, ore: 2 },
  temple: { wood: 0, stone: 10, money: 30, ore: 0 },
  forestTemple: { wood: 0, stone: 10, money: 30, ore: 0 },
};

function neighborTile(map: GameMap, n: { q: number; r: number }): MapTile | undefined {
  return map.tiles.find((t) => t.q === n.q && t.r === n.r);
}

export function canBuildSawmill(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'forestry')) return false;
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
  if (!hasSkill(player, 'smithery')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isMountainType(tile.terrain);
}

export function canBuildPort(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'water')) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  if (!isWaterType(tile.terrain)) return false;
  // A port must sit on the player's own coast so a land unit can reach and
  // board it; a water tile in the middle of a lake or at the map edge cannot.
  return hexNeighbors(tile).some((n) => {
    const t = neighborTile(map, n);
    return t !== undefined && t.ownedBy === player.index && !isWaterType(t.terrain);
  });
}

export function canBuildTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'waterTemples')) return false;
  if (tile.bridge !== undefined && tile.bridge !== null) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isWaterType(tile.terrain);
}

export function canBuildForestTemple(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'forestTemple')) return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  return isForestType(tile.terrain);
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
  if (kind === 'temple' || kind === 'forestTemple') return false;
  if (tile.ownedBy !== player.index) return false;
  if (tile.settlement || tile.building) return false;
  if (!villageHasBuildingSlot(map, tile, player)) return false;
  if (kind === 'mine') {
    return isMountainType(tile.terrain);
  }
  if (kind === 'port') {
    if (tile.bridge !== undefined && tile.bridge !== null) return false;
    if (!isWaterType(tile.terrain)) return false;
    return hexNeighbors(tile).some((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && t.ownedBy === player.index && !isWaterType(t.terrain);
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
    const ok = kind === 'bridge'
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
  if (!canAfford(player.resources, moneyCost(DESTROY_BUILDING_COST))) return false;
  player.resources = pay(player.resources, moneyCost(DESTROY_BUILDING_COST));
  tile.building = null;
  return true;
}

/** Repairs a damaged own building to full hp, charging `REPAIR_COST`. Returns
 *  true when the repair happened (validated + affordable). */
export function repairBuilding(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canRepairBuilding(map, tile, player)) return false;
  if (!canAfford(player.resources, REPAIR_COST)) return false;
  player.resources = pay(player.resources, REPAIR_COST);
  delete tile.building!.hp;
  return true;
}

export function canUsePort(tile: MapTile, player: Player): boolean {
  return tile.building?.kind === 'port' && tile.ownedBy === player.index;
}

const PORT_DIRECTION_VECTORS: { d: PortDirection; o: { q: number; r: number } }[] = [
  { d: 'e', o: { q: 1, r: 0 } },
  { d: 'ne', o: { q: 1, r: -1 } },
  { d: 'nw', o: { q: 0, r: -1 } },
  { d: 'w', o: { q: -1, r: 0 } },
  { d: 'sw', o: { q: -1, r: 1 } },
  { d: 'se', o: { q: 0, r: 1 } },
];

export function portDirection(map: GameMap, tile: MapTile): PortDirection | null {
  if (tile.building?.kind !== 'port' || tile.ownedBy === null) return null;
  const owner = tile.ownedBy;
  const home = tile.claimedByVillage ? axialKey(tile.claimedByVillage) : null;
  const ownedShore = (n: MapTile): boolean =>
    n.ownedBy === owner && !isWaterType(n.terrain);
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
    kind === 'sawmill'
      ? canBuildSawmill(map, tile, player)
      : kind === 'mine'
        ? canBuildMine(map, tile, player)
        : kind === 'port'
          ? canBuildPort(map, tile, player)
          : kind === 'temple'
            ? canBuildTemple(map, tile, player)
            : canBuildForestTemple(map, tile, player);
  if (!allowed) return false;
  return payAndPlaceBuilding(tile, kind, player);
}

/** Places a building at its cost without re-validating the skill — used by the
 *  Villagers builder, whose eligibility (terrain/territory/slot) was already
 *  checked by `builderBuildable`. */
export function buildBuildingIgnoringSkill(map: GameMap, tile: MapTile, kind: BuildingKind, player: Player): boolean {
  return payAndPlaceBuilding(tile, kind, player);
}

function payAndPlaceBuilding(tile: MapTile, kind: BuildingKind, player: Player): boolean {
  const cost = BUILDING_COSTS[kind];
  if (!canAfford(player.resources, cost)) return false;
  player.resources = pay(player.resources, cost);
  tile.building = { kind, level: 1 };
  return true;
}

export function buildingIncome(
  map: GameMap,
  player: Player,
): { wood: number; stone: number; ore: number } {
  let wood = 0;
  let stone = 0;
  let ore = 0;
  for (const tile of map.tiles) {
    if (tile.ownedBy !== player.index || !tile.building) continue;
    // Buildings on the territory of a village an enemy unit stands on stop
    // producing until the enemy leaves.
    const c = tile.claimedByVillage;
    if (c) {
      const village = neighborTile(map, c);
      if (village && villageEnemyOccupied(village)) continue;
    }
    if (tile.building.kind === 'mine') {
      const bonus = hasSkill(player, 'geology') ? 1 : 0;
      stone += tile.building.level + bonus;
      ore += tile.building.level + bonus;
      continue;
    }
    if (tile.building.kind === 'sawmill') {
      const forests = hexNeighbors(tile).filter((n) => {
        const t = neighborTile(map, n);
        return t !== undefined && isForestType(t.terrain);
      }).length;
      wood += tile.building.level * forests;
    }
  }
  return { wood, stone, ore };
}

export function buildingYield(
  map: GameMap,
  tile: MapTile,
  owner: Player | null,
): { wood: number; stone: number; ore: number } {
  const b = tile.building;
  if (!b) return { wood: 0, stone: 0, ore: 0 };
  if (b.kind === 'sawmill') {
    const forests = hexNeighbors(tile).filter((n) => {
      const t = neighborTile(map, n);
      return t !== undefined && isForestType(t.terrain);
    }).length;
    return { wood: b.level * forests, stone: 0, ore: 0 };
  }
  if (b.kind === 'mine') {
    const bonus = owner !== null && hasSkill(owner, 'geology') ? 1 : 0;
    return { wood: 0, stone: b.level + bonus, ore: b.level + bonus };
  }
  return { wood: 0, stone: 0, ore: 0 };
}
