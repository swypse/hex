import { roadNetworkComponents } from './road-network';
import { untrackedNetworks } from './network-fingerprint';
import { axialKey, hexNeighbors } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { type Resources } from './resources';
import { canAffordAt, payAt, villagesJoinedBy } from './stock';
import { hasSkill } from '../skills';
import { isIceType, isWaterType } from '../map/tile-types';
import { portWaterClusterJumps } from './water-roads';
import { BuildingKind, SkillId } from '@enums';
import { tileMapByKey } from '../map/tile-index';
import { tileAt } from '../map/tile-index';

export const ROAD_COST: Resources = { wood: 5, stone: 2, money: 10, ore: 0, food: 0 };

function isRoadNode(t: MapTile, owner: number): boolean {
  if (t.roadOwner === owner) return true;
  return t.building?.kind === BuildingKind.PORT && t.ownedBy === owner;
}

/** How many extra village groups destroying the road on `tile` would create:
 *  0 when the road is not its owner's only link between any two villages (or
 *  has no owner). Measured on the owner's road/port network. */
export function roadCutSplits(map: GameMap, tile: MapTile): number {
  const owner = tile.roadOwner;
  if (owner === null || owner === undefined) return 0;
  const villageKeys = map.tiles
    .filter((t) => t.settlement !== null && t.settlement.owner === owner)
    .map((t) => axialKey(t));
  const groups = (): number => {
    const seen = new Set<number>();
    const comps = roadNetworkComponents(map, owner);
    for (const k of villageKeys) {
      const i = comps.findIndex((c) => c.has(k));
      seen.add(i);
    }
    return seen.size;
  };
  const before = groups();
  const savedBridge = tile.bridge;
  // What-if mutation: the network memo must not trust its epoch meanwhile.
  const after = untrackedNetworks(() => {
    tile.roadOwner = null;
    tile.bridge = null;
    const n = groups();
    tile.roadOwner = owner;
    tile.bridge = savedBridge;
    return n;
  });
  return Math.max(0, after - before);
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
  if (!hasSkill(player, SkillId.ROADS)) return false;
  if (!canBuildRoadHere(map, tile, player, connectedNodes)) return false;
  return canAffordAt(map, player, tile, ROAD_COST, villagesJoinedBy(map, player.index, tile));
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
  if (isWaterType(tile.terrain) || isIceType(tile.terrain)) return false;
  if (tile.settlement !== null) return false;
  if (tile.building !== null && tile.building.kind === BuildingKind.PORT) return false;
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
  if (!payAt(map, player, tile, ROAD_COST, villagesJoinedBy(map, player.index, tile))) return false;
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
