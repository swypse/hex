import { Axial, axialKey, hexNeighbors, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/map-gen';
import { portDirection } from '../game/buildings';
import { isExploredFor } from '../game/explore';
import { adjacentFarmCount } from '../game/food';
import { BuildingKind } from '@enums';
import { weatherOverlayAt } from '../game/weather';

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
  return Math.min(6, Math.max(1, adjacentFarmCount(map, tile, tile.ownedBy)));
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
  const neighborOf = (n: Axial): MapTile | undefined =>
    tileIndex ? tileIndex.get(axialKey(n)) : map.tiles.find((x) => x.q === n.q && x.r === n.r);
  const neighborOwners = hexNeighbors(tile).map((n) => {
    const t = neighborOf(n);
    return t ? (t.ownedBy ?? '-') : 'x';
  }).join(',');
  const neighborRoads = hexNeighbors(tile).map((n) => {
    const t = neighborOf(n);
    return t ? (t.roadOwner ?? '-') : 'x';
  }).join(',');
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
