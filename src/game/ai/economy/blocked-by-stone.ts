import { AiActionType, AiStance, BuildingKind, FoodPressure } from '@enums';
import { foodNetworkStates, networkStateOfTile } from '../../economy/food';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { flagsFor } from '../config/flags';
import { ownUnitCount } from '../situation/army-power';
import { landEnemyCanReach } from '../situation/enemy-reach';
import { isClaimedBy } from '../situation/is-claimed-by';
import { nearestEnemyDistanceFrom } from '../situation/nearest-distances';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';

/** Land units the AI always fields before the stone focus may hold spawns back. */
export const ARMY_FLOOR_UNITS = 3;

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
      if (flagsFor(player).armyFloor && ownUnitCount(map, player.index) < ARMY_FLOOR_UNITS) return false;
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
      const home = tile?.claimedByVillage ? needy.find((v) => isClaimedBy(tile, v)) : undefined;
      if (action.kind === BuildingKind.SAWMILL && home) {
        return map.tiles.some((t) => t.building?.kind === BuildingKind.SAWMILL && isClaimedBy(t, home));
      }
      if (action.kind === BuildingKind.PORT && situation?.navalThreat) return false;
      // The very first farm is food for the opening and never waits for the mine.
      if (action.kind === BuildingKind.FARM && flagsFor(player).earlyFarm && !map.tiles.some((t) => t.building?.kind === BuildingKind.FARM && t.ownedBy === player.index)) return false;
      return !foodUrgent();
    }
    case AiActionType.BUILD_ROAD:
    case AiActionType.BUILD_BRIDGE:
      return !foodUrgent();
    default:
      return false;
  }
}
