import { isExploredFor } from '../../map/explore';
import { hexDistance } from '../../map/hex';
import type { GameMap } from '../../map/map-gen';
import type { FreeVillageTarget } from './situation';
import { ownUnitTiles } from './village-dangers';

export function freeVillages(map: GameMap, playerIndex: number): FreeVillageTarget[] {
  const out: FreeVillageTarget[] = [];
  const own = ownUnitTiles(map, playerIndex);
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== null) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let minDist = Infinity;
    for (const u of own) {
      const d = hexDistance(u, t);
      if (d < minDist) minDist = d;
    }
    out.push({ village: t, distance: minDist });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
