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
  if (tile.roadOwner !== null && tile.roadOwner !== undefined) return false;
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
  if (!connected) return false;
  return canAfford(player.resources, ROAD_COST);
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
  const visited = new Set<string>();
  const queue: MapTile[] = [];
  const seed = (t: MapTile | undefined): void => {
    if (!t) return;
    const isRoad = t.roadOwner !== null && t.roadOwner !== undefined;
    const isPort = t.building?.kind === 'port' && t.ownedBy !== null && t.ownedBy !== undefined;
    if (!isRoad && !isPort) return;
    const k = axialKey(t);
    if (visited.has(k)) return;
    visited.add(k);
    queue.push(t);
  };
  for (const n of hexNeighbors(villageTile)) seed(tileAt(map, n.q, n.r));
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const t = tileAt(map, n.q, n.r);
      if (!t) continue;
      if (t.settlement && t.settlement.owner !== null && t.settlement.owner !== owner) {
        return true;
      }
      seed(t);
    }
  }
  return false;
}
