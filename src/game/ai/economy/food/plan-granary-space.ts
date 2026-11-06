import { BuildingKind, SkillId } from '@enums';
import { canBuildFarm, canBuildGranary } from '../../../economy/buildings';
import type { FoodNetworkState } from '../../../economy/food';
import { axialKey } from '../../../map/hex';
import type { GameMap, MapTile } from '../../../map/map-gen';
import type { Player } from '../../../players';
import { hasSkill } from '../../../skills';

/** An own building to demolish so that `then` can be built in its place. */
export interface SpaceClearing {
  tile: MapTile;
  then: BuildingKind.GRANARY | BuildingKind.FARM;
}

/** Demolition order: cheapest and most replaceable first. */
const DEMOLISH_ORDER: readonly BuildingKind[] = [BuildingKind.SAWMILL, BuildingKind.TEMPLE, BuildingKind.FOREST_TEMPLE, BuildingKind.MINE, BuildingKind.PORT];

/** For each network that needs a granary but has no tile for one, the building
 *  to demolish to make room: a non-food building next to one of its farms
 *  (food buildings take no village slot, but they need a free land tile), or,
 *  when it has no farm and no farm site either, one on a tile a farm could use. */
export function planGranarySpace(map: GameMap, player: Player, states: FoodNetworkState[], needy: Set<string>): SpaceClearing[] {
  const out: SpaceClearing[] = [];
  if (!hasSkill(player, SkillId.GRANARY) || !hasSkill(player, SkillId.AGRICULTURE)) return out;
  for (const net of states) {
    if (!needy.has(axialKey(net.villages[0]!))) continue;
    const own = map.tiles.filter((t) => t.ownedBy === player.index && t.claimedByVillage && net.keys.has(axialKey(t.claimedByVillage)));
    if (own.some((t) => canBuildGranary(map, t, player))) continue;
    const farms = own.filter((t) => t.building?.kind === BuildingKind.FARM);
    let then: SpaceClearing['then'];
    let usable: (t: MapTile) => boolean;
    if (farms.length > 0) {
      then = BuildingKind.GRANARY;
      usable = (t) => canBuildGranary(map, { ...t, building: null }, player);
    } else if (!own.some((t) => canBuildFarm(map, t, player))) {
      then = BuildingKind.FARM;
      usable = (t) => canBuildFarm(map, { ...t, building: null }, player);
    } else {
      continue;
    }
    const victims = own.filter((t) => t.building !== null && !isFoodKind(t.building.kind) && usable(t));
    victims.sort((a, b) => DEMOLISH_ORDER.indexOf(a.building!.kind) - DEMOLISH_ORDER.indexOf(b.building!.kind));
    if (victims[0]) out.push({ tile: victims[0], then });
  }
  return out;
}

function isFoodKind(kind: BuildingKind): boolean {
  return kind === BuildingKind.FARM || kind === BuildingKind.GRANARY;
}
