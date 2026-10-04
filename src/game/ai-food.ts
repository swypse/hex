import { BUILDING_COSTS, canBuildFarm, canBuildPort } from './buildings';
import { axialKey, hexNeighbors } from './hex';
import type { GameMap, MapTile } from './map-gen';
import { tileMapByKey } from './map-gen';
import type { Player } from './players';
import { farmYield, type FoodNetworkState } from './food';
import { ROAD_COST, roadNetworkComponents } from './roads';
import { hasSkill } from './skills';
import { isWaterType } from './tile-types';
import type { Resources } from './resources';
import { BuildingKind, FoodPressure, SkillId } from '@enums';

/** The AI's answer to networks that cannot feed their units. */
export interface FoodPlan {
  /** Networks (by the key of their first village) whose fix is a link to a
   *  food surplus (roads and/or ports): they build no farms until it is done. */
  linkFirst: Set<string>;
  /** Road tiles to build now, each with the pressure of the starving network. */
  roads: { tile: MapTile; pressure: FoodPressure.LOW | FoodPressure.URGENT }[];
  /** Port tiles to build now. */
  ports: { tile: MapTile; pressure: FoodPressure.LOW | FoodPressure.URGENT }[];
}

/** Rough price of a bundle of resources, to compare a farm to a road or port. */
function weigh(cost: Resources): number {
  return cost.money + cost.wood * 2 + cost.stone * 3;
}

/** Whether a new road could be laid on `tile` (terrain and ownership only). */
function roadSite(tile: MapTile, owner: number): boolean {
  if (tile.roadOwner !== null && tile.roadOwner !== undefined) return false;
  if (tile.ownedBy !== null && tile.ownedBy !== owner) return false;
  if (isWaterType(tile.terrain) || tile.settlement !== null) return false;
  if (tile.building !== null && tile.building.kind === BuildingKind.PORT) return false;
  return !(tile.unit && tile.unit.owner !== owner);
}

/** Breadth-first field of buildable road tiles reachable from the node set
 *  `from`: the number of new road tiles needed to reach each (1 = touching the
 *  network) and the way back. */
interface RoadField {
  dist: Map<string, number>;
  parent: Map<string, string | null>;
}

function roadField(map: GameMap, owner: number, from: Set<string>): RoadField {
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
function pathTo(map: GameMap, field: RoadField, end: string): MapTile[] {
  const byKey = tileMapByKey(map);
  const path: MapTile[] = [];
  for (let k: string | null | undefined = end; k; k = field.parent.get(k)) path.push(byKey.get(k)!);
  return path.reverse();
}

/** What it takes to join a network to a target: the road tiles to lay (nearest
 *  to the source first) and the ports to build. */
interface Link {
  cost: number;
  path: MapTile[];
  ports: MapTile[];
}

/** Shortest chain of new road tiles joining two node sets, or null. */
function roadLink(map: GameMap, field: RoadField, to: Set<string>): Link | null {
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

/** Own water cells grouped into connected clusters (tile key -> cluster id):
 *  ports in one cluster are linked automatically. */
function waterClusters(map: GameMap, owner: number): Map<string, number> {
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
function portSideCosts(
  map: GameMap,
  player: Player,
  comp: Set<string>,
  field: RoadField,
  clusters: Map<string, number>,
): Map<number, Link> {
  const byKey = tileMapByKey(map);
  const out = new Map<number, Link>();
  for (const k of comp) {
    const t = byKey.get(k);
    const c = clusters.get(k);
    if (t?.building?.kind === BuildingKind.PORT && t.ownedBy === player.index && c !== undefined) out.set(c, { cost: 0, path: [], ports: [] });
  }
  const portCost = weigh(BUILDING_COSTS.port);
  for (const site of map.tiles) {
    const c = clusters.get(axialKey(site));
    if (c === undefined || out.get(c)?.cost === 0 || !canBuildPort(map, site, player)) continue;
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
    if (link && (!out.has(c) || link.cost < out.get(c)!.cost)) out.set(c, link);
  }
  return out;
}

/** For every starving network decides what is cheapest per food gained: a new
 *  farm in it, roads to a network with a food surplus, or ports (plus the roads
 *  to them) that put both networks on one water route. */
export function planFoodFixes(map: GameMap, player: Player, states: FoodNetworkState[]): FoodPlan {
  const plan: FoodPlan = { linkFirst: new Set(), roads: [], ports: [] };
  const hungry = states.filter((n) => n.balance < 0 && n.pressure !== FoodPressure.NONE);
  const canRoad = hasSkill(player, SkillId.ROADS);
  const canPort = hasSkill(player, SkillId.WATER);
  if (hungry.length === 0 || (!canRoad && !canPort)) return plan;
  const comps = roadNetworkComponents(map, player.index);
  const compOf = (n: FoodNetworkState): Set<string> | undefined => comps.find((c) => c.has([...n.keys][0]!));
  const clusters = canPort ? waterClusters(map, player.index) : new Map<string, number>();
  const farmCost = weigh(BUILDING_COSTS.farm);
  const fields = new Map<Set<string>, RoadField>();
  const fieldOf = (comp: Set<string>): RoadField => {
    let f = fields.get(comp);
    if (!f) fields.set(comp, (f = roadField(map, player.index, comp)));
    return f;
  };

  for (const d of hungry) {
    const deficit = -d.balance;
    const dComp = compOf(d);
    if (!dComp) continue;
    const farmSite = map.tiles.some(
      (t) => t.ownedBy === player.index && t.claimedByVillage && d.keys.has(axialKey(t.claimedByVillage)) && canBuildFarm(map, t, player),
    );
    const farmRatio = farmSite ? Math.min(deficit, farmYield(player, map)) / farmCost : 0;

    let best: { sides: Link[]; ratio: number } | null = null;
    const consider = (sides: Link[], surplus: number): void => {
      const cost = sides.reduce((sum, l) => sum + l.cost, 0);
      if (cost <= 0) return;
      const ratio = Math.min(deficit, surplus) / cost;
      if (!best || ratio > best.ratio) best = { sides, ratio };
    };
    const dPorts = canPort ? portSideCosts(map, player, dComp, fieldOf(dComp), clusters) : null;
    for (const s of states) {
      if (s === d || s.balance <= 0) continue;
      const sComp = compOf(s);
      if (!sComp) continue;
      if (canRoad) {
        const link = roadLink(map, fieldOf(dComp), sComp);
        if (link) consider([link], s.balance);
      }
      if (dPorts) {
        const sPorts = portSideCosts(map, player, sComp, fieldOf(sComp), clusters);
        for (const [c, dSide] of dPorts) {
          const sSide = sPorts.get(c);
          if (sSide) consider([dSide, sSide], s.balance);
        }
      }
    }
    const chosen = best as { sides: Link[]; ratio: number } | null;
    if (!chosen || chosen.ratio <= farmRatio) continue;
    plan.linkFirst.add(axialKey(d.villages[0]!));
    const pressure = d.pressure === FoodPressure.URGENT ? FoodPressure.URGENT : FoodPressure.LOW;
    for (const side of chosen.sides) {
      // Build what touches the network now: the port when no roads are needed,
      // otherwise the road tile next to the network (and the far end of a
      // road-only link, which touches the other network).
      if (side.path.length === 0) {
        for (const tile of side.ports) plan.ports.push({ tile, pressure });
      } else {
        plan.roads.push({ tile: side.path[0]!, pressure });
        if (side.ports.length === 0 && side.path.length > 1) plan.roads.push({ tile: side.path[side.path.length - 1]!, pressure });
      }
    }
  }
  return plan;
}
