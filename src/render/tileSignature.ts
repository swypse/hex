import { Axial, axialKey, hexNeighbors, hexToPixel } from '../game/hex';
import { GameMap, MapTile } from '../game/mapGen';
import { portDirection } from '../game/buildings';
import { isExploredFor } from '../game/explore';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}

export function tileSignature(
  tile: MapTile,
  map: GameMap,
  localPlayerIndex: number,
  hiddenUnitIds: Set<string>,
  knownOwners?: Set<number>,
  tileIndex?: Map<string, MapTile>,
): string {
  const explored = isExploredFor(tile, localPlayerIndex);
  const s = tile.settlement;
  const u = tile.unit;
  const hidden = u ? hiddenUnitIds.has(u.id) : false;
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
    s ? (s.capital ? 'c' : '') : '',
    u ? u.id : '-',
    u ? u.type : '',
    u ? u.owner : '',
    u ? (u.shipLevel ?? '') : '',
    hidden ? 'h' : '',
    tile.building ? tile.building.kind : '',
    tile.building?.kind === 'port' ? (portDirection(map, tile) ?? '-') : '',
    tile.building?.kind === 'temple' || tile.building?.kind === 'forestTemple' ? String(tile.building.level) : '',
    tile.roadOwner ?? '-',
    tile.bridge ? `${tile.bridge.dir}${tile.bridge.owner}` : '',
    tile.ownedBy ?? '-',
    tile.bonus ? tile.bonus.kind : '',
    neighborOwners,
    neighborRoads,
    tile.ownedBy === null ? '-' : (knownOwners?.has(tile.ownedBy) ? 'k' : 'u'),
  ].join('|');
}

export function tileInView(tile: MapTile, hexSize: number, vp: Viewport): boolean {
  const p = hexToPixel(tile, hexSize);
  const sx = vp.x + p.x * vp.scale;
  const sy = vp.y + p.y * vp.scale;
  const margin = hexSize * vp.scale * 2;
  return sx >= -margin && sx <= vp.width + margin && sy >= -margin && sy <= vp.height + margin;
}
