import { GameMap, MapTile, type BridgeDir } from './mapGen';
import { Player } from './players';
import { canAfford, pay, Resources } from './resources';
import { tileAt } from './selection';
import { hasSkill } from './skills';
import { isWaterType } from './tileTypes';

export const BRIDGE_COST: Resources = { wood: 10, stone: 5, money: 15, ore: 0 };

/** Each axis is a pair of opposite hex neighbours of the water tile. */
const AXES: { dir: BridgeDir; offsets: { q: number; r: number }[] }[] = [
  { dir: 'we', offsets: [{ q: 1, r: 0 }, { q: -1, r: 0 }] },
  { dir: 'ne', offsets: [{ q: 1, r: -1 }, { q: -1, r: 1 }] },
  { dir: 'nw', offsets: [{ q: 0, r: -1 }, { q: 0, r: 1 }] },
];

function isLandShore(map: GameMap, tile: MapTile, offset: { q: number; r: number }): boolean {
  const t = tileAt(map, tile.q + offset.q, tile.r + offset.r);
  return t !== undefined && !isWaterType(t.terrain);
}

export function bridgeDirFor(map: GameMap, tile: MapTile): BridgeDir | null {
  for (const axis of AXES) {
    if (isLandShore(map, tile, axis.offsets[0]!) && isLandShore(map, tile, axis.offsets[1]!)) {
      return axis.dir;
    }
  }
  return null;
}

export function hasBridge(tile: MapTile): boolean {
  return tile.bridge !== undefined && tile.bridge !== null;
}

export function canBuildBridge(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'bridges')) return false;
  if (!isWaterType(tile.terrain)) return false;
  if (tile.building) return false;
  if (hasBridge(tile)) return false;
  if (tile.unit) return false;
  if (bridgeDirFor(map, tile) === null) return false;
  return true;
}

export function buildBridge(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!canBuildBridge(map, tile, player)) return false;
  if (!canAfford(player.resources, BRIDGE_COST)) return false;
  const dir = bridgeDirFor(map, tile)!;
  player.resources = pay(player.resources, BRIDGE_COST);
  tile.bridge = { owner: player.index, dir };
  tile.roadOwner = player.index;
  return true;
}
