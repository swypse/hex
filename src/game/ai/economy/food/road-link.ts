import { ROAD_COST } from '../../../economy/roads';
import { axialKey, hexNeighbors } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import { tileMapByKey } from '../../../map/tile-index';
import { type RoadField, pathTo } from './road-field';
import { weigh } from './road-site';

/** What it takes to join a network to a target: the road tiles to lay (nearest
 *  to the source first) and the ports to build. */
export interface Link {
  cost: number;
  path: MapTile[];
  ports: MapTile[];
}

/** Shortest chain of new road tiles joining two node sets, or null. */
export function roadLink(map: GameMap, field: RoadField, to: Set<string>): Link | null {
  const byKey = tileMapByKey(map);
  let best: string | null = null;
  for (const [k, d] of field.dist) {
    const t = byKey.get(k)!;
    if (!hexNeighbors(t).some((n) => to.has(axialKey(n)))) continue;
    if (best === null || d < field.dist.get(best)!) best = k;
  }
  if (best === null) return null;
  const path = pathTo(map, field, best);
  return { cost: path.length * weigh(ROAD_COST), path, ports: [] };
}
