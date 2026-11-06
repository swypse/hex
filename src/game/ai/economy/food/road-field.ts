import { axialKey, hexNeighbors } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import { tileMapByKey } from '../../../map/tile-index';
import { roadSite } from './road-site';

/** Breadth-first field of buildable road tiles reachable from the node set
 *  `from`: the number of new road tiles needed to reach each (1 = touching the
 *  network) and the way back. */
export interface RoadField {
  dist: Map<string, number>;
  parent: Map<string, string | null>;
}

export function roadField(map: GameMap, owner: number, from: Set<string>): RoadField {
  const byKey = tileMapByKey(map);
  const dist = new Map<string, number>();
  const parent = new Map<string, string | null>();
  let frontier: MapTile[] = [];
  for (const k of from) {
    const node = byKey.get(k);
    if (!node) continue;
    for (const n of hexNeighbors(node)) {
      const t = byKey.get(axialKey(n));
      if (t && !dist.has(axialKey(t)) && roadSite(t, owner)) {
        dist.set(axialKey(t), 1);
        parent.set(axialKey(t), null);
        frontier.push(t);
      }
    }
  }
  while (frontier.length > 0) {
    const next: MapTile[] = [];
    for (const t of frontier) {
      for (const n of hexNeighbors(t)) {
        const nt = byKey.get(axialKey(n));
        if (nt && !dist.has(axialKey(nt)) && roadSite(nt, owner)) {
          dist.set(axialKey(nt), dist.get(axialKey(t))! + 1);
          parent.set(axialKey(nt), axialKey(t));
          next.push(nt);
        }
      }
    }
    frontier = next;
  }
  return { dist, parent };
}

/** The road tiles from the network to `end`, nearest to the network first. */
export function pathTo(map: GameMap, field: RoadField, end: string): MapTile[] {
  const byKey = tileMapByKey(map);
  const path: MapTile[] = [];
  for (let k: string | null | undefined = end; k; k = field.parent.get(k)) path.push(byKey.get(k)!);
  return path.reverse();
}
