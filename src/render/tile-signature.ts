import { type Axial, axialKey, hexNeighbors, hexToPixel } from '../game/map/hex';
import { type GameMap, type MapTile } from '../game/map/map-gen';
import { portDirection } from '../game/economy/buildings';
import { isExploredFor } from '../game/map/explore';
import { adjacentFarmCount } from '../game/economy/food';
import { BuildingKind } from '@enums';
import { weatherOverlayAt } from '../game/weather/weather';
import { clamp } from '../util/math';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  /** 0 = default fit view, 1 = fully zoomed out; used to hide detail text. */
  zoomOut?: number;
}

/** Adjacent own farms of a granary, clamped to the available art (1..6). */
export function granaryFarmCount(map: GameMap, tile: MapTile): number {
  if (tile.ownedBy === null) return 1;
  return clamp(adjacentFarmCount(map, tile, tile.ownedBy), 1, 6);
}

const NEIGHBOR_KEYS = new Map<string, string[]>();

/** Keys of a tile's six neighbours, cached by tile key: the signature pass runs
 *  over every tile on each render, and building the keys dominated it. */
function neighborKeys(tile: Axial): string[] {
  const key = axialKey(tile);
  let keys = NEIGHBOR_KEYS.get(key);
  if (!keys) NEIGHBOR_KEYS.set(key, (keys = hexNeighbors(tile).map((n) => axialKey(n))));
  return keys;
}

export function tileSignature(
  tile: MapTile,
  map: GameMap,
  localPlayerIndex: number,
  hiddenUnitIds: Set<string>,
  knownOwners?: Set<number>,
  tileIndex?: Map<string, MapTile>,
  waterRouteNeighbors?: Map<string, string[]>,
): string {
  const explored = isExploredFor(tile, localPlayerIndex);
  const s = tile.settlement;
  const u = tile.unit;
  const hidden = u ? hiddenUnitIds.has(u.id) || (u.owner !== localPlayerIndex && u.isStealthed === true) : false;
  let neighborOwners = '';
  let neighborRoads = '';
  for (const n of neighborKeys(tile)) {
    const t = tileIndex ? tileIndex.get(n) : map.tiles.find((x) => axialKey(x) === n);
    neighborOwners += `${t ? (t.ownedBy ?? '-') : 'x'},`;
    neighborRoads += `${t ? (t.roadOwner ?? '-') : 'x'},`;
  }
  return [
    explored ? '1' : '0',
    tile.terrain,
    s ? (s.owner ?? 'f') : '-',
    s ? s.level : '',
    s ? (s.wall ? 'w' : '') : '',
    s ? (s.capital ? 'c' : '') : '',
    u ? u.id : '-',
    u ? u.type : '',
    u ? u.owner : '',
    u ? (u.shipLevel ?? '') : '',
    u ? (u.paidBy ?? []).join(',') : '',
    u ? (u.isStealthed ? 's' : '') : '',
    weatherOverlayAt(map, tile) ?? '',
    hidden ? 'h' : '',
    tile.building ? tile.building.kind : '',
    tile.building?.kind === BuildingKind.PORT ? (portDirection(map, tile) ?? '-') : '',
    tile.building?.kind === BuildingKind.TEMPLE || tile.building?.kind === BuildingKind.FOREST_TEMPLE ? String(tile.building.level) : '',
    tile.building?.kind === BuildingKind.GRANARY ? String(granaryFarmCount(map, tile)) : '',
    tile.bottle ? tile.bottle.bornTurn : '',
    tile.trap ? `t${tile.trap.owner}` : '',
    tile.roadOwner ?? '-',
    tile.bridge ? `${tile.bridge.dir}${tile.bridge.owner}` : '',
    tile.ownedBy ?? '-',
    tile.bonus ? tile.bonus.kind : '',
    neighborOwners,
    neighborRoads,
    tile.ownedBy === null ? '-' : (knownOwners?.has(tile.ownedBy) ? 'k' : 'u'),
    tile.bottle ? String(tile.bottle.bornTurn) : '',
    (waterRouteNeighbors?.get(axialKey(tile)) ?? []).join(','),
  ].join('|');
}

export function tileInView(tile: MapTile, hexSize: number, vp: Viewport): boolean {
  const p = hexToPixel(tile, hexSize);
  const sx = vp.x + p.x * vp.scale;
  const sy = vp.y + p.y * vp.scale;
  const margin = hexSize * vp.scale * 2;
  return sx >= -margin && sx <= vp.width + margin && sy >= -margin && sy <= vp.height + margin;
}
