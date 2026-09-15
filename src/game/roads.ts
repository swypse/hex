import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile, tileMapByKey } from './mapGen';
import { Player } from './players';
import { canAfford, pay, Resources } from './resources';
import { tileAt } from './selection';
import { hasSkill } from './skills';
import { isWaterType } from './tileTypes';
import { portWaterClusterJumps } from './waterRoads';

export const ROAD_COST: Resources = { wood: 5, stone: 2, money: 10, ore: 0 };

function isRoadNode(t: MapTile, owner: number): boolean {
  if (t.roadOwner === owner) return true;
  return t.building?.kind === 'port' && t.ownedBy === owner;
}

/** Connected components of a player's road/port/bridge network: own villages,
 *  own roads and own ports, where ports in the same own-water cluster are
 *  treated as adjacent. Each component is a set of tile keys. */
export function roadNetworkComponents(
  map: GameMap,
  owner: number,
  waterJumps: Map<string, Set<string>> = portWaterClusterJumps(map),
): Set<string>[] {
  const byKey = tileMapByKey(map);
  const isNode = (t: MapTile): boolean =>
    (t.settlement !== null && t.settlement.owner === owner) ||
    t.roadOwner === owner ||
    (t.building?.kind === 'port' && t.ownedBy === owner);
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const start of map.tiles) {
    const startKey = axialKey(start);
    if (visited.has(startKey) || !isNode(start)) continue;
    const comp = new Set<string>([startKey]);
    const queue: MapTile[] = [start];
    visited.add(startKey);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      // Ports in the same own-water cluster are effectively adjacent: a
      // village reached through a port's water route joins this component.
      const siblings = waterJumps.get(axialKey(cur));
      if (siblings) {
        for (const sk of siblings) {
          if (visited.has(sk)) continue;
          visited.add(sk);
          comp.add(sk);
          const t = byKey.get(sk);
          if (t) queue.push(t);
        }
      }
      for (const n of hexNeighbors(cur)) {
        const t = byKey.get(axialKey(n));
        if (!t || visited.has(axialKey(t)) || !isNode(t)) continue;
        visited.add(axialKey(t));
        comp.add(axialKey(t));
        queue.push(t);
      }
    }
    components.push(comp);
  }
  return components;
}

/** Tile keys of the player's road/port/bridge nodes that share a component
 *  with at least one of the player's own villages. Only these nodes may be
 *  extended by new roads — an orphaned bridge or a road stub left behind by a
 *  captured village cannot grow further. */
export function villageConnectedNodes(
  map: GameMap,
  owner: number,
  waterJumps: Map<string, Set<string>> = portWaterClusterJumps(map),
): Set<string> {
  const byKey = tileMapByKey(map);
  const out = new Set<string>();
  for (const comp of roadNetworkComponents(map, owner, waterJumps)) {
    const hasVillage = [...comp].some(
      (k) => byKey.get(k)?.settlement?.owner === owner,
    );
    if (hasVillage) {
      for (const k of comp) out.add(k);
    }
  }
  return out;
}

export function canBuildRoad(
  map: GameMap,
  tile: MapTile,
  player: Player,
  connectedNodes: Set<string> = villageConnectedNodes(map, player.index),
): boolean {
  if (!hasSkill(player, 'roads')) return false;
  if (!canBuildRoadHere(map, tile, player, connectedNodes)) return false;
  return canAfford(player.resources, ROAD_COST);
}

/** Terrain/ownership preconditions for a road on this tile, without requiring
 *  the Roads skill or the money to pay for it (used by the open-Roads hint). */
export function canBuildRoadHere(
  map: GameMap,
  tile: MapTile,
  player: Player,
  connectedNodes: Set<string> = villageConnectedNodes(map, player.index),
): boolean {
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
    return isRoadNode(t, player.index) && connectedNodes.has(axialKey(t));
  });
  return connected;
}

export function buildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canBuildRoad(map, tile, player)) return false;
  player.resources = pay(player.resources, ROAD_COST);
  tile.roadOwner = player.index;
  return true;
}

export function isVillageRoadConnected(
  map: GameMap,
  villageTile: MapTile,
  waterJumps: Map<string, Set<string>> = portWaterClusterJumps(map),
): boolean {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return false;
  const byKey = tileMapByKey(map);
  const home = axialKey(villageTile);
  for (const comp of roadNetworkComponents(map, owner, waterJumps)) {
    if (!comp.has(home)) continue;
    // Connected when another own village shares this component.
    for (const k of comp) {
      const t = byKey.get(k);
      if (t && t.settlement !== null && t.settlement.owner === owner && k !== home) {
        return true;
      }
    }
    return false;
  }
  return false;
}
