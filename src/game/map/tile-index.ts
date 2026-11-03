import { axialKey } from './hex';
import type { GameMap, MapTile } from './map-gen';

interface TileIndexEntry {
  length: number;
  first: MapTile | undefined;
  last: MapTile | undefined;
  index: Map<string, MapTile>;
}
const tileIndexCache = new WeakMap<MapTile[], TileIndexEntry>();

/** Index a map's tiles by their axial key for O(1) neighbourhood lookups.
 *
 *  The index is cached per tiles array: rebuilding a string-keyed Map of every
 *  tile on each call dominated the AI turn (road, food and port network code
 *  all ask for it, many times per planning step). The tile *set* of a map never
 *  changes during play (tile objects are mutated in place), so the cache is
 *  rebuilt only if the array grew or shrank or its ends were swapped. The
 *  returned Map is shared: callers must treat it as read-only. */
export function tileMapByKey(map: Pick<GameMap, 'tiles'>): Map<string, MapTile> {
  const tiles = map.tiles;
  const hit = tileIndexCache.get(tiles);
  if (hit && hit.length === tiles.length && hit.first === tiles[0] && hit.last === tiles[tiles.length - 1]) return hit.index;
  const index = new Map(tiles.map((t) => [axialKey(t), t] as const));
  tileIndexCache.set(tiles, { length: tiles.length, first: tiles[0], last: tiles[tiles.length - 1], index });
  return index;
}

export function tileAt(map: Pick<GameMap, 'tiles'>, q: number, r: number): MapTile | undefined {
  return tileMapByKey(map).get(axialKey({ q, r }));
}
