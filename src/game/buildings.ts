import { hexDistance, hexNeighbors, hexToPixel } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, Resources } from './resources';
import { hasSkill } from './skills';
import { isForestType, isLandType, isMountainType, isWaterType } from './tileTypes';
import { buildingsInVillage, villageBuildingLimit } from './village';
import type { BuildingKind } from './events';

export const SAWMILL_COST = 10;
export const MINE_COST = 15;

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
  sawmill: 'Sawmill',
  mine: 'Mine',
  port: 'Port',
  temple: 'Water temple',
  forestTemple: 'Forest temple',
};

export const BUILDING_COSTS: Record<BuildingKind, Resources> = {
  sawmill: { wood: 0, stone: 0, money: SAWMILL_COST, ore: 0 },
  mine: { wood: 0, stone: 0, money: MINE_COST, ore: 0 },
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
  return isWaterType(tile.terrain);
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
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== tile.ownedBy) continue;
    const d = hexDistance(tile, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  if (!best) return null;
  const from = hexToPixel(tile, 1);
  const to = hexToPixel(best, 1);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  let result: PortDirection = 'e';
  let bestDot = -Infinity;
  for (const { d, o } of PORT_DIRECTION_VECTORS) {
    const v = hexToPixel(o, 1);
    const vLen = Math.hypot(v.x, v.y) || 1;
    const dot = ((dx / len) * v.x + (dy / len) * v.y) / vLen;
    if (dot > bestDot) {
      bestDot = dot;
      result = d;
    }
  }
  return result;
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
    if (tile.building.kind === 'mine') {
      stone += tile.building.level;
      ore += tile.building.level + (hasSkill(player, 'geology') ? 1 : 0);
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
    const geology = owner !== null && hasSkill(owner, 'geology');
    return { wood: 0, stone: b.level, ore: b.level + (geology ? 1 : 0) };
  }
  return { wood: 0, stone: 0, ore: 0 };
}
