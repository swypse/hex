import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { canAfford, pay, Resources } from './resources';
import { tileAt } from './selection';
import { hasSkill } from './skills';
import { isWaterType } from './tileTypes';

export const ROAD_COST: Resources = { wood: 5, stone: 2, money: 10, ore: 0 };

function isRoadNode(t: MapTile, owner: number): boolean {
  if (t.roadOwner === owner) return true;
  return t.building?.kind === 'port' && t.ownedBy === owner;
}

export function canBuildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'roads')) return false;
  if (!canBuildRoadHere(map, tile, player)) return false;
  return canAfford(player.resources, ROAD_COST);
}

/** Terrain/ownership preconditions for a road on this tile, without requiring
 *  the Roads skill or the money to pay for it (used by the open-Roads hint). */
export function canBuildRoadHere(map: GameMap, tile: MapTile, player: Player): boolean {
  if (tile.roadOwner !== null && tile.roadOwner !== undefined) return false;
  // Roads may only cross the player's own or unclaimed territory, never an
  // enemy's.
  if (tile.ownedBy !== null && tile.ownedBy !== player.index) return false;
  if (isWaterType(tile.terrain)) return false;
  if (tile.settlement !== null) return false;
  if (tile.building !== null && tile.building.kind === 'port') return false;
  if (tile.unit !== null && tile.unit.owner !== player.index) return false;
  const connected = hexNeighbors(tile).some((n) => {
    const t = tileAt(map, n.q, n.r);
    if (!t) return false;
    if (t.settlement && t.settlement.owner === player.index) return true;
    return isRoadNode(t, player.index);
  });
  return connected;
}

export function buildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canBuildRoad(map, tile, player)) return false;
  player.resources = pay(player.resources, ROAD_COST);
  tile.roadOwner = player.index;
  return true;
}

export function isVillageRoadConnected(map: GameMap, villageTile: MapTile): boolean {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return false;
  const byKey = new Map(map.tiles.map((t) => [axialKey(t), t] as const));
  const isNode = (t: MapTile): boolean => {
    if (axialKey(t) === axialKey(villageTile)) return true;
    if (t.settlement !== null && t.settlement.owner === owner) return true;
    if (t.roadOwner === owner) return true;
    return t.building?.kind === 'port' && t.ownedBy === owner;
  };
  const visited = new Set<string>([axialKey(villageTile)]);
  const queue: MapTile[] = [villageTile];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const t = byKey.get(axialKey(n));
      if (!t || visited.has(axialKey(t)) || !isNode(t)) continue;
      if (t.settlement !== null && t.settlement.owner === owner && !(t.q === villageTile.q && t.r === villageTile.r)) {
        return true;
      }
      visited.add(axialKey(t));
      queue.push(t);
    }
  }
  return false;
}
