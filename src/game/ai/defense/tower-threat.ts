import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { isShip } from '../../units/ship';

/** Enemy land units within `TOWER_THREAT_RADIUS` of a village that make the AI fortify it. */
export const TOWER_THREAT_UNITS = 3;

const TOWER_THREAT_RADIUS = 4;

export interface Threat {
  count: number;
  /** Mean position of the threatening units (fractional axial coordinates). */
  center: { q: number; r: number };
}

/** The visible enemy land units pressing on `village`, or null when too few. */
export function towerThreat(map: GameMap, player: Player, village: MapTile): Threat | null {
  let count = 0;
  let q = 0;
  let r = 0;
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner === player.index || u.isStealthed === true || isShip(u)) continue;
    if (!isExploredFor(t, player.index) || hexDistance(village, t) > TOWER_THREAT_RADIUS) continue;
    count++;
    q += t.q;
    r += t.r;
  }
  return count >= TOWER_THREAT_UNITS ? { count, center: { q: q / count, r: r / count } } : null;
}
