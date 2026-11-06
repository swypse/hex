import { BuildingKind } from '@enums';
import { BUILDING_COSTS, canBuildPort } from '../../../economy/buildings';
import { ROAD_COST } from '../../../economy/roads';
import { axialKey, hexNeighbors } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import { tileMapByKey } from '../../../map/tile-index';
import { isWaterType } from '../../../map/tile-types';
import type { Player } from '../../../players';
import type { WaterAtlas } from '../analyze-water';
import { portSiteValue } from '../port-site-value';
import { type RoadField, pathTo } from './road-field';
import type { Link } from './road-link';
import { weigh } from './road-site';

/** Own water cells grouped into connected clusters (tile key -> cluster id):
 *  ports in one cluster are linked automatically. */
export function waterClusters(map: GameMap, owner: number): Map<string, number> {
  const byKey = tileMapByKey(map);
  const cluster = new Map<string, number>();
  let id = 0;
  for (const start of map.tiles) {
    const sk = axialKey(start);
    if (cluster.has(sk) || !isWaterType(start.terrain) || start.ownedBy !== owner) continue;
    cluster.set(sk, id);
    const queue: MapTile[] = [start];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of hexNeighbors(cur)) {
        const t = byKey.get(axialKey(n));
        if (t && !cluster.has(axialKey(t)) && isWaterType(t.terrain) && t.ownedBy === owner) {
          cluster.set(axialKey(t), id);
          queue.push(t);
        }
      }
    }
    id++;
  }
  return cluster;
}

/** Cheapest way for a network to gain a port in each own-water cluster: 0 where
 *  it already has one, otherwise a port on a free coast site plus the roads
 *  that reach it. */
export function portSideCosts(
  map: GameMap,
  player: Player,
  comp: Set<string>,
  field: RoadField,
  clusters: Map<string, number>,
  water: WaterAtlas,
): Map<number, Link> {
  const byKey = tileMapByKey(map);
  const out = new Map<number, Link>();
  for (const k of comp) {
    const t = byKey.get(k);
    const c = clusters.get(k);
    if (t?.building?.kind === BuildingKind.PORT && t.ownedBy === player.index && c !== undefined) out.set(c, { cost: 0, path: [], ports: [] });
  }
  const portCost = weigh(BUILDING_COSTS.port);
  // Among sites, the cheapest wins; what a site opens up (ocean, a way to the enemy) offsets its price.
  const edge = new Map<number, number>();
  for (const site of map.tiles) {
    const c = clusters.get(axialKey(site));
    if (c === undefined || out.get(c)?.cost === 0 || !canBuildPort(map, site, player)) continue;
    // A pond is fine here: both networks must reach it, so the port does join them.
    const value = Math.max(0, portSiteValue(water, site));
    let link: Link | null = null;
    if (hexNeighbors(site).some((n) => comp.has(axialKey(n)))) {
      link = { cost: portCost, path: [], ports: [site] };
    } else {
      // Roads must end on a land tile touching the port site.
      let bestEnd: string | null = null;
      for (const n of hexNeighbors(site)) {
        const d = field.dist.get(axialKey(n));
        if (d !== undefined && (bestEnd === null || d < field.dist.get(bestEnd)!)) bestEnd = axialKey(n);
      }
      if (bestEnd !== null) {
        const path = pathTo(map, field, bestEnd);
        link = { cost: portCost + path.length * weigh(ROAD_COST), path, ports: [site] };
      }
    }
    if (link && (!out.has(c) || link.cost - value < edge.get(c)!)) {
      out.set(c, link);
      edge.set(c, link.cost - value);
    }
  }
  return out;
}
