import { Season } from '@enums';
import { Biome } from '../map/biomes';
import { axialKey, hexNeighbors } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { isForestType, isMountainType, isWaterType } from '../map/tile-types';
import { waterRouteEdges } from '../economy/water-roads';
import { stormOverTile, WEATHER_RULES } from '../weather/weather';

/** Move-points cost to LEAVE a tile of each terrain kind. Land also covers
 *  village/settlement tiles; settlements never reduce the base cost. */
export const TILE_MOVE_COST = { land: 10, water: 10, forest: 14, mountain: 20 };

/** Winter forest cost outside the desert: snowed-in woods are as easy to cross as open land. */
const WINTER_FOREST_MOVE_COST = 10;

/** Cost to leave a forest tile: cheaper in winter, except in the desert. */
function forestMoveCost(map: GameMap, tile: MapTile): number {
  return map.season === Season.WINTER && tile.biome !== Biome.Desert ? WINTER_FOREST_MOVE_COST : TILE_MOVE_COST.forest;
}

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
        ? forestMoveCost(map, tile)
        : TILE_MOVE_COST.land;
  // Leaving a water tile inside a storm costs more move points.
  const cost = stormOverTile(map, tile) ? base * WEATHER_RULES.storm.moveCostFactor : base;
  const discount =
    tile.roadOwner === owner ||
    (isWaterType(tile.terrain) && tile.ownedBy === owner && waterKeys?.has(axialKey(tile))) ||
    (tile.settlement !== null && tile.settlement.owner === owner && ownRoadNeighbor(map, tile, owner));
  return discount ? Math.floor(cost / 2) : cost;
}