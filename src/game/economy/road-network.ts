import { axialKey, hexNeighbors } from '../map/hex';
import type { MapTile, GameMap } from '../map/map-gen';
import { tileMapByKey } from '../map/tile-index';
import { portWaterClusterJumps } from './water-roads';
import { BuildingKind } from '@enums';
import { NetworkMemo } from './network-fingerprint';

/** Connected components of a player's road/port/bridge network: own villages,
 *  own roads and own ports, where ports in the same own-water cluster are
 *  treated as adjacent. Each component is a set of tile keys. */
export function roadNetworkComponents(
  map: GameMap,
  owner: number,
  waterJumps?: Map<string, Set<string>>,
): Set<string>[] {
  // Memoized per map state (shared result: read-only) unless the caller
  // supplies its own water jumps.
  if (waterJumps) return computeComponents(map, owner, waterJumps);
  const byOwner = componentsMemo.get(map, () => new Map<number, Set<string>[]>());
  let comps = byOwner.get(owner);
  if (!comps) byOwner.set(owner, (comps = computeComponents(map, owner, portWaterClusterJumps(map))));
  return comps;
}

const componentsMemo = new NetworkMemo<Map<number, Set<string>[]>>();

function computeComponents(map: GameMap, owner: number, waterJumps: Map<string, Set<string>>): Set<string>[] {
  const byKey = tileMapByKey(map);
  const isNode = (t: MapTile): boolean =>
    (t.settlement !== null && t.settlement.owner === owner) ||
    t.roadOwner === owner ||
    (t.building?.kind === BuildingKind.PORT && t.ownedBy === owner);
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const start of map.tiles) {
    const startKey = axialKey(start);
    if (visited.has(startKey) || !isNode(start)) continue;
    const comp = new Set<string>([startKey]);
    const queue: MapTile[] = [start];
    visited.add(startKey);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      // Ports in the same own-water cluster are effectively adjacent: a
      // village reached through a port's water route joins this component.
      const siblings = waterJumps.get(axialKey(cur));
      if (siblings) {
        for (const sk of siblings) {
          if (visited.has(sk)) continue;
          visited.add(sk);
          comp.add(sk);
          const t = byKey.get(sk);
          if (t) queue.push(t);
        }
      }
      for (const n of hexNeighbors(cur)) {
        const t = byKey.get(axialKey(n));
        if (!t || visited.has(axialKey(t)) || !isNode(t)) continue;
        visited.add(axialKey(t));
        comp.add(axialKey(t));
        queue.push(t);
      }
    }
    components.push(comp);
  }
  return components;
}
