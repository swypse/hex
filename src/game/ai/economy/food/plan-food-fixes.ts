import { FoodPressure, SkillId } from '@enums';
import { BUILDING_COSTS, canBuildFarm } from '../../../economy/buildings';
import { type FoodNetworkState, farmYield } from '../../../economy/food';
import { roadNetworkComponents } from '../../../economy/road-network';
import { axialKey } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import type { Player } from '../../../players';
import { hasSkill } from '../../../skills';
import { analyzeWater } from '../analyze-water';
import { type RoadField, roadField } from './road-field';
import { type Link, roadLink } from './road-link';
import { weigh } from './road-site';
import { portSideCosts, waterClusters } from './water-clusters';

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
  const water = analyzeWater(map, player.index);
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
    const dPorts = canPort ? portSideCosts(map, player, dComp, fieldOf(dComp), clusters, water) : null;
    for (const s of states) {
      if (s === d || s.balance <= 0) continue;
      const sComp = compOf(s);
      if (!sComp) continue;
      if (canRoad) {
        const link = roadLink(map, fieldOf(dComp), sComp);
        if (link) consider([link], s.balance);
      }
      if (dPorts) {
        const sPorts = portSideCosts(map, player, sComp, fieldOf(sComp), clusters, water);
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
