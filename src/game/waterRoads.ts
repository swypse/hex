import { axialKey, hexNeighbors } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isWaterType } from './tileTypes';

export interface WaterComponent {
  owner: number;
  ports: MapTile[];
  tiles: Set<string>;
}

/** Flood-filled components over a player's own water cells (terrain water
 *  tiles it owns, bridges and ports included) that contain at least two of
 *  the player's own ports. */
export function findWaterPortComponents(map: GameMap): WaterComponent[] {
  const byKey = new Map(map.tiles.map((t) => [axialKey(t), t] as const));
  const owners = new Set<number>();
  for (const t of map.tiles) {
    if (t.building?.kind === 'port' && t.ownedBy !== null && t.ownedBy !== undefined) {
      owners.add(t.ownedBy);
    }
  }
  const components: WaterComponent[] = [];
  for (const owner of owners) {
    const unvisited = new Set<string>();
    for (const t of map.tiles) {
      if (isOwnWater(t, owner)) unvisited.add(axialKey(t));
    }
    while (unvisited.size > 0) {
      const seed = unvisited.values().next().value as string;
      unvisited.delete(seed);
      const tiles = new Set<string>();
      const queue = [seed];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const curTile = byKey.get(cur);
        if (!curTile) continue;
        tiles.add(cur);
        for (const n of hexNeighbors(curTile)) {
          const nk = axialKey(n);
          if (!unvisited.has(nk)) continue;
          unvisited.delete(nk);
          queue.push(nk);
        }
      }
      const ports = [...tiles]
        .map((k) => byKey.get(k))
        .filter((t) => t !== undefined && t.building?.kind === 'port');
      if (ports.length >= 2) components.push({ owner, ports: ports as MapTile[], tiles });
    }
  }
  return components;
}

function isOwnWater(t: MapTile, owner: number): boolean {
  return isWaterType(t.terrain) && t.ownedBy === owner;
}

/** Port keys reachable over own water within the same cluster — empty when
 *  the cluster holds a single port. Keyed by each own port tile. */
export function portWaterClusterJumps(map: GameMap): Map<string, Set<string>> {
  const jumps = new Map<string, Set<string>>();
  for (const comp of findWaterPortComponents(map)) {
    const keys = comp.ports.map((p) => axialKey(p));
    for (const key of keys) {
      const set = new Set(keys.filter((k) => k !== key));
      jumps.set(key, set);
    }
  }
  return jumps;
}

function pathsBetweenPorts(ports: MapTile[], tiles: Set<string>): Map<string, Map<string, string[]>> {
  const byKey = new Map([...tiles].map((k) => {
    const [q, r] = k.split(',').map(Number);
    return [k, { q: q!, r: r! }] as const;
  }));
  const allPaths = new Map<string, Map<string, string[]>>();
  for (const start of ports) {
    const from = axialKey(start);
    const distances = new Map<string, string[] | null>();
    const queue: string[] = [];
    for (const k of tiles) distances.set(k, null);
    distances.set(from, []);
    queue.push(from);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      const curPath = distances.get(cur)!;
      const curPos = byKey.get(cur)!;
      for (const n of hexNeighbors(curPos)) {
        const nk = axialKey(n);
        if (!distances.has(nk) || distances.get(nk) !== null) continue;
        distances.set(nk, [...curPath, nk]);
        queue.push(nk);
      }
    }
    const toOthers = new Map<string, string[]>();
    for (const p of ports) {
      const pk = axialKey(p);
      if (pk === from) continue;
      toOthers.set(pk, distances.get(pk) ?? []);
    }
    allPaths.set(from, toOthers);
  }
  return allPaths;
}

/** Adjacent own-water tile pairs (tileKey -> sorted neighbour keys) that form
 *  the nearest-neighbour shortest routes between connected own ports. Used to
 *  draw the light-blue water roads. */
export function waterRouteEdges(map: GameMap): Map<string, string[]> {
  const edges = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string): void => {
    const ea = edges.get(a) ?? new Set<string>();
    ea.add(b);
    edges.set(a, ea);
    const eb = edges.get(b) ?? new Set<string>();
    eb.add(a);
    edges.set(b, eb);
  };
  for (const comp of findWaterPortComponents(map)) {
    const ports = comp.ports;
    const allPaths = pathsBetweenPorts(ports, comp.tiles);
    const connected = new Set<string>([axialKey(ports[0]!)]);
    const remaining = new Set(ports.slice(1).map((p) => axialKey(p)));
    while (remaining.size > 0) {
      let best: { from: string; to: string; path: string[]; dist: number } | null = null;
      for (const rk of remaining) {
        for (const ck of connected) {
          const path = allPaths.get(ck)?.get(rk);
          if (!path || path.length === 0) continue;
          const dist = path.length;
          if (!best || dist < best.dist) best = { from: ck, to: rk, path, dist };
        }
      }
      if (!best) break;
      let prev = best.from;
      for (const step of best.path) {
        addEdge(prev, step);
        prev = step;
      }
      connected.add(best.to);
      remaining.delete(best.to);
    }
  }
  const sorted = new Map<string, string[]>();
  for (const [k, set] of edges) {
    sorted.set(k, [...set].sort());
  }
  return sorted;
}