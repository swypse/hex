import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isForestType, isMountainType, isWaterType } from './tileTypes';
import { waterRouteEdges } from './waterRoads';

/** Move-points cost to LEAVE a tile of each terrain kind. Land also covers
 *  village/settlement tiles; settlements never reduce the base cost. */
export const TILE_MOVE_COST = { land: 10, water: 10, forest: 14, mountain: 20 };

/** Keys of water tiles that form a port water route (components holding two
 *  or more of a player's own ports). Computed once per reachability query. */
export function waterRouteKeys(map: GameMap): Set<string> {
  return new Set(waterRouteEdges(map).keys());
}

function ownRoadNeighbor(map: GameMap, tile: MapTile, owner: number): boolean {
  return hexNeighbors(tile).some((n) => {
    const t = map.tiles.find((x) => x.q === n.q && x.r === n.r);
    return t !== undefined && t.roadOwner === owner;
  });
}

/** Move-points cost to leave `tile` for a unit of `owner`. Cost is halved
 *  (rounded down) only for the owner: on own roads, own port water-route
 *  tiles, and own villages connected to the owner's road network.
 *  `waterKeys` is the precomputed `waterRouteKeys(map)` when available. */
export function tileMoveCost(
  map: GameMap,
  tile: MapTile,
  owner: number,
  waterKeys?: Set<string>,
): number {
  const base = isWaterType(tile.terrain)
    ? TILE_MOVE_COST.water
    : isMountainType(tile.terrain)
      ? TILE_MOVE_COST.mountain
      : isForestType(tile.terrain)
        ? TILE_MOVE_COST.forest
        : TILE_MOVE_COST.land;
  const discount =
    tile.roadOwner === owner ||
    (isWaterType(tile.terrain) && tile.ownedBy === owner && waterKeys?.has(axialKey(tile))) ||
    (tile.settlement !== null && tile.settlement.owner === owner && ownRoadNeighbor(map, tile, owner));
  return discount ? Math.floor(base / 2) : base;
}