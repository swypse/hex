import { FoodPressure, SkillId } from '@enums';
import { canBuildFarm, canBuildGranary } from '../../../economy/buildings';
import { type FoodNetworkState, needsWinterStorage } from '../../../economy/food';
import { roadNetworkComponents } from '../../../economy/road-network';
import { axialKey } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import type { Player } from '../../../players';
import { hasSkill } from '../../../skills';
import { analyzeWater } from '../analyze-water';
import { roadField } from './road-field';
import { type Link, roadLink } from './road-link';
import { portSideCosts, waterClusters } from './water-clusters';

/** What the AI does so networks without a granary survive winter. */
export interface StorageOutlook {
  /** Networks (by the key of their first village) that need a granary. */
  needy: Set<string>;
  /** Of those, the ones with no site for their own granary: they must be linked
   *  to a network that has one. */
  linkFirst: Set<string>;
  roads: { tile: MapTile; pressure: FoodPressure.LOW }[];
  ports: { tile: MapTile; pressure: FoodPressure.LOW }[];
}

/** Networks that need winter storage and a plan to connect those that cannot
 *  build a granary themselves (no farm site) to a network that has one. */
export function planWinterStorage(map: GameMap, player: Player, states: FoodNetworkState[]): StorageOutlook {
  const out: StorageOutlook = { needy: new Set(), linkFirst: new Set(), roads: [], ports: [] };
  const needy = states.filter((n) => needsWinterStorage(map, n));
  if (needy.length === 0) return out;
  for (const n of needy) out.needy.add(axialKey(n.villages[0]!));
  const canRoad = hasSkill(player, SkillId.ROADS);
  const canPort = hasSkill(player, SkillId.WATER);
  const targets = states.filter((n) => n.granaries > 0);
  if (!hasSkill(player, SkillId.GRANARY) || targets.length === 0 || (!canRoad && !canPort)) return out;
  const comps = roadNetworkComponents(map, player.index);
  const compOf = (n: FoodNetworkState): Set<string> | undefined => comps.find((c) => c.has([...n.keys][0]!));
  const clusters = canPort ? waterClusters(map, player.index) : new Map<string, number>();
  const water = analyzeWater(map, player.index);
  for (const d of needy) {
    const ownSite = map.tiles.some((t) => t.claimedByVillage && d.keys.has(axialKey(t.claimedByVillage)) && canBuildGranary(map, t, player));
    // A farm may still come first: the granary needs one next to it.
    const farmSite = map.tiles.some((t) => t.claimedByVillage && d.keys.has(axialKey(t.claimedByVillage)) && canBuildFarm(map, t, player));
    if (ownSite || farmSite) continue;
    const dComp = compOf(d);
    if (!dComp) continue;
    const dField = roadField(map, player.index, dComp);
    const dPorts = canPort ? portSideCosts(map, player, dComp, dField, clusters, water) : null;
    let best: { sides: Link[]; cost: number } | null = null;
    const consider = (sides: Link[]): void => {
      const cost = sides.reduce((sum, l) => sum + l.cost, 0);
      if (cost > 0 && (!best || cost < best.cost)) best = { sides, cost };
    };
    for (const s of targets) {
      if (s === d) continue;
      const sComp = compOf(s);
      if (!sComp) continue;
      if (sComp === dComp) continue;
      if (canRoad) {
        const link = roadLink(map, dField, sComp);
        if (link) consider([link]);
      }
      if (dPorts) {
        const sPorts = portSideCosts(map, player, sComp, roadField(map, player.index, sComp), clusters, water);
        for (const [c, dSide] of dPorts) {
          const sSide = sPorts.get(c);
          if (sSide) consider([dSide, sSide]);
        }
      }
    }
    const chosen = best as { sides: Link[]; cost: number } | null;
    if (!chosen) continue;
    out.linkFirst.add(axialKey(d.villages[0]!));
    for (const side of chosen.sides) {
      if (side.path.length === 0) {
        for (const tile of side.ports) out.ports.push({ tile, pressure: FoodPressure.LOW });
      } else {
        out.roads.push({ tile: side.path[0]!, pressure: FoodPressure.LOW });
        if (side.ports.length === 0 && side.path.length > 1) out.roads.push({ tile: side.path[side.path.length - 1]!, pressure: FoodPressure.LOW });
      }
    }
  }
  return out;
}
