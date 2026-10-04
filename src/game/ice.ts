import { hexNeighbors } from './hex';
import type { Axial } from './hex';
import type { GameMap, MapTile } from './map-gen';
import { revertShip } from './ship';
import { TileType } from './tile-types';
import { UnitType } from '@enums';

export function countIceTiles(map: GameMap): number {
  let n = 0;
  for (const t of map.tiles) if (t.terrain === TileType.Ice) n++;
  return n;
}

export interface FreezeReport {
  frozen: Axial[];
  /** Ships that were on a freezing tile and became land units. */
  landed: { unitId: string; owner: number }[];
  /** Pirate ships that were on a freezing tile and vanished. */
  removed: Axial[];
}

export interface ThawReport {
  thawed: Axial[];
  /** Units that stood on melting ice and died. */
  killed: { unitId: string; q: number; r: number; owner: number }[];
}

/** Whether a water tile may turn to ice: it touches solid land and carries no
 *  port/building or bridge. */
function canFreeze(map: GameMap, byKey: Map<string, MapTile>, tile: MapTile): boolean {
  if (tile.terrain !== TileType.Water) return false;
  if (tile.building || tile.bridge) return false;
  return hexNeighbors(tile).some((n) => {
    const t = byKey.get(`${n.q},${n.r}`);
    return t !== undefined && t.terrain !== TileType.Water && t.terrain !== TileType.Ice;
  });
}

/** Winter: coast water tiles turn to ice. Ships on them land as land units,
 *  pirate ships disappear. Decided on the pre-freeze map, so ice does not
 *  spread inward by more than one tile. */
export function freezeCoast(map: GameMap): FreezeReport {
  const byKey = new Map(map.tiles.map((t) => [`${t.q},${t.r}`, t] as const));
  const targets = map.tiles.filter((t) => canFreeze(map, byKey, t));
  const report: FreezeReport = { frozen: [], landed: [], removed: [] };
  for (const tile of targets) {
    tile.terrain = TileType.Ice;
    report.frozen.push({ q: tile.q, r: tile.r });
    const unit = tile.unit;
    if (!unit) continue;
    if (unit.type === UnitType.PIRATE) {
      tile.unit = null;
      report.removed.push({ q: tile.q, r: tile.r });
    } else if (unit.shipLevel !== undefined) {
      revertShip(unit);
      report.landed.push({ unitId: unit.id, owner: unit.owner });
    }
  }
  return report;
}

/** Spring: ice melts back to water; any unit still standing on it dies. */
export function thawIce(map: GameMap): ThawReport {
  const report: ThawReport = { thawed: [], killed: [] };
  for (const tile of map.tiles) {
    if (tile.terrain !== TileType.Ice) continue;
    tile.terrain = TileType.Water;
    report.thawed.push({ q: tile.q, r: tile.r });
    if (tile.unit) {
      report.killed.push({ unitId: tile.unit.id, q: tile.q, r: tile.r, owner: tile.unit.owner });
      tile.unit = null;
    }
  }
  return report;
}
