import { roadNetworkComponents } from '../economy/road-network';
import { hexDistance } from '../map/hex';
import type { GameMap, MapTile } from '../map/map-gen';
import { tileMapByKey } from '../map/tile-index';
import type { Player } from '../players';
import { hasSkill } from '../skills';
import { SkillId } from '@enums';
import { pathTo, portSideCosts, roadField, roadLink, waterClusters, type Link, type RoadField } from './ai-food';
import { analyzeWater, type WaterAtlas } from './ai-water';

/** Tiles to build now to join the player's separate village networks or to push a road at the enemy. */
export interface LinkPlan {
  /** Road tiles linking own villages (road-only joins, or the way to a port). */
  roads: MapTile[];
  ports: MapTile[];
  /** The next road tile toward the nearest known enemy village. */
  enemyRoad: MapTile | null;
}

/** The road never reaches further than this many new tiles toward an enemy. */
const ENEMY_ROAD_REACH = 10;
/** The road toward an enemy stops this close to its village (the border blocks it anyway). */
const ENEMY_ROAD_STOP = 2;

/** What of a link can be built this turn: the port when no roads are needed, otherwise the road
 *  tile next to the network (and the far end of a road-only link). */
function buildableNow(sides: Link[], into: { roads: MapTile[]; ports: MapTile[] }): void {
  for (const side of sides) {
    if (side.path.length === 0) {
      into.ports.push(...side.ports);
    } else {
      into.roads.push(side.path[0]!);
      if (side.ports.length === 0 && side.path.length > 1) into.roads.push(side.path[side.path.length - 1]!);
    }
  }
}

export function planLinks(map: GameMap, player: Player, water: WaterAtlas = analyzeWater(map, player.index)): LinkPlan {
  const plan: LinkPlan = { roads: [], ports: [], enemyRoad: null };
  const canRoad = hasSkill(player, SkillId.ROADS);
  const canPort = hasSkill(player, SkillId.WATER);
  if (!canRoad && !canPort) return plan;
  const byKey = tileMapByKey(map);
  const isVillage = (k: string): boolean => byKey.get(k)?.settlement?.owner === player.index;
  const comps = roadNetworkComponents(map, player.index).filter((c) => [...c].some(isVillage));
  if (comps.length === 0) return plan;
  const villagesIn = (c: Set<string>): number => [...c].filter(isVillage).length;
  const fields = new Map<Set<string>, RoadField>();
  const fieldOf = (c: Set<string>): RoadField => {
    let f = fields.get(c);
    if (!f) fields.set(c, (f = roadField(map, player.index, c)));
    return f;
  };

  if (comps.length > 1) joinNetworks(map, player, comps, villagesIn, fieldOf, water, canRoad, canPort, plan);
  if (canRoad) plan.enemyRoad = roadTowardEnemy(map, player, comps, fieldOf);
  return plan;
}

/** Joins the networks to the biggest one, the cheapest way: a road, or ports when those are cheaper. */
function joinNetworks(
  map: GameMap,
  player: Player,
  comps: Set<string>[],
  villagesIn: (c: Set<string>) => number,
  fieldOf: (c: Set<string>) => RoadField,
  water: WaterAtlas,
  canRoad: boolean,
  canPort: boolean,
  plan: LinkPlan,
): void {
  const hub = comps.reduce((a, b) => (villagesIn(b) > villagesIn(a) ? b : a));
  const clusters = canPort ? waterClusters(map, player.index) : new Map<string, number>();
  const hubPorts = canPort ? portSideCosts(map, player, hub, fieldOf(hub), clusters, water) : null;
  let best: { sides: Link[]; cost: number } | null = null;
  const consider = (sides: Link[]): void => {
    const cost = sides.reduce((sum, l) => sum + l.cost, 0);
    if (cost > 0 && (!best || cost < best.cost)) best = { sides, cost };
  };
  for (const other of comps) {
    if (other === hub) continue;
    if (canRoad) {
      const link = roadLink(map, fieldOf(other), hub);
      if (link) consider([link]);
    }
    if (hubPorts) {
      const sides = portSideCosts(map, player, other, fieldOf(other), clusters, water);
      for (const [c, side] of sides) {
        const hubSide = hubPorts.get(c);
        if (hubSide) consider([side, hubSide]);
      }
    }
  }
  const chosen = best as { sides: Link[]; cost: number } | null;
  if (chosen) buildableNow(chosen.sides, plan);
}

/** The next road tile on the way from the own network to the nearest known enemy village. */
function roadTowardEnemy(map: GameMap, player: Player, comps: Set<string>[], fieldOf: (c: Set<string>) => RoadField): MapTile | null {
  const byKey = tileMapByKey(map);
  const enemies = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== player.index && t.exploredBy?.includes(player.index));
  if (enemies.length === 0) return null;
  // The network node closest to an enemy village decides which network extends.
  let from: { comp: Set<string>; node: MapTile; enemy: MapTile; dist: number } | null = null;
  for (const comp of comps) {
    for (const k of comp) {
      const node = byKey.get(k)!;
      for (const enemy of enemies) {
        const dist = hexDistance(node, enemy);
        if (!from || dist < from.dist) from = { comp, node, enemy, dist };
      }
    }
  }
  if (!from || from.dist <= ENEMY_ROAD_STOP) return null;
  const field = fieldOf(from.comp);
  let end: string | null = null;
  let endDist = from.dist;
  for (const [k, d] of field.dist) {
    if (d > ENEMY_ROAD_REACH) continue;
    const gap = hexDistance(byKey.get(k)!, from.enemy);
    // Must close in on the enemy; of equal gaps the shorter road wins.
    if (gap < endDist || (end !== null && gap === endDist && d < field.dist.get(end)!)) {
      end = k;
      endDist = gap;
    }
  }
  return end === null ? null : (pathTo(map, field, end)[0] ?? null);
}
