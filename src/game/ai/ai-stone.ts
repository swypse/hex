import type { AiAction } from './ai-types';
import { foodNetworkStates, networkStateOfTile } from '../economy/food';
import { landEnemyCanReach, nearestEnemyDistanceFrom } from './ai-patterns';
import type { AiSituation } from './ai-situation';
import { axialKey } from '../map/hex';
import type { GameMap, MapTile } from '../map/map-gen';
import type { Player } from '../players';
import { hasSkill } from '../skills';
import { isMountainType } from '../map/tile-types';
import { AiActionType, AiStance, BuildingKind, FoodPressure, SkillId } from '@enums';

/** A village is claimed by `v` when its territory tile points back at it. */
function claimedBy(t: MapTile, v: MapTile): boolean {
  return t.claimedByVillage !== undefined && t.claimedByVillage !== null && axialKey(t.claimedByVillage) === axialKey(v);
}

/** Own villages that could have a mine (Smithery learned, an unbuilt mountain
 *  in their territory) but have none yet. */
export function villagesNeedingMine(map: GameMap, player: Player): MapTile[] {
  if (!hasSkill(player, SkillId.SMITHERY)) return [];
  const out: MapTile[] = [];
  for (const v of map.tiles) {
    if (!v.settlement || v.settlement.owner !== player.index) continue;
    let hasMine = false;
    let site = false;
    for (const t of map.tiles) {
      if (t.ownedBy !== player.index || !claimedBy(t, v)) continue;
      if (t.building?.kind === BuildingKind.MINE) hasMine = true;
      else if (!t.building && !t.settlement && isMountainType(t.terrain)) site = true;
    }
    if (site && !hasMine) out.push(v);
  }
  return out;
}

/** Whether `action` must wait for a mine: it spends money (spawn, upgrade,
 *  building, road) and the AI is not in danger, or it is a building other than
 *  a mine (or the one sawmill) in a village that has no mine yet. */
export function blockedByStone(map: GameMap, player: Player, action: AiAction, situation: AiSituation | undefined, needy: MapTile[]): boolean {
  if (needy.length === 0) return false;
  const tile = 'q' in action && 'r' in action ? map.tiles.find((t) => t.q === action.q && t.r === action.r) : undefined;
  const foodUrgent = (): boolean => {
    const net = tile ? networkStateOfTile(foodNetworkStates(map, player), tile) : undefined;
    return net?.pressure === FoodPressure.URGENT;
  };
  switch (action.type) {
    case AiActionType.SPAWN: {
      const v = tile;
      const danger = v !== undefined && (landEnemyCanReach(map, v, player.index) || (situation?.navalEnemies.length ?? 0) > 0 || situation?.stance === AiStance.DEFEND);
      return !danger;
    }
    case AiActionType.UPGRADE: {
      const v = tile;
      const front = v !== undefined && nearestEnemyDistanceFrom(map, player.index, v) <= 4;
      // A full village upgrades to get the slot its mine needs.
      return !front && !(v !== undefined && needy.includes(v));
    }
    case AiActionType.BUILD: {
      if (action.kind === BuildingKind.MINE) return false;
      const home = tile?.claimedByVillage ? needy.find((v) => claimedBy(tile, v)) : undefined;
      if (action.kind === BuildingKind.SAWMILL && home) {
        return map.tiles.some((t) => t.building?.kind === BuildingKind.SAWMILL && claimedBy(t, home));
      }
      if (action.kind === BuildingKind.PORT && situation?.navalThreat) return false;
      return !foodUrgent();
    }
    case AiActionType.BUILD_ROAD:
    case AiActionType.BUILD_BRIDGE:
      return !foodUrgent();
    default:
      return false;
  }
}
