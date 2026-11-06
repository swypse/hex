import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { ownUnitTiles } from './village-dangers';

export function nearestEnemyVillage(map: GameMap, playerIndex: number): MapTile | null {
  let best: MapTile | null = null;
  let bestDist = Infinity;
  const own = ownUnitTiles(map, playerIndex);
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === playerIndex || t.settlement.owner === null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let dist = hexDistance({ q: 0, r: 0 }, t);
    for (const u of own) {
      const d = hexDistance(u, t);
      if (d < dist) dist = d;
    }
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}
