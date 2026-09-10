import { GameMap } from './mapGen';
import type { Player } from './players';
import { canMove, canAttack, canHeal, UNIT_TYPES } from './units';
import { reachableTargets } from './selection';
import { attackableTargets } from './combat';
import { hasSkill, canOpenSkill, SKILLS } from './skills';
import { unitsInVillage, villageCapacity, canBuildWall } from './village';
import { canAfford, villageUpgradeCost } from './resources';
import {
  canBuildSawmill,
  canBuildMine,
  canBuildPort,
  canBuildTemple,
  canBuildForestTemple,
  BUILDING_COSTS,
} from './buildings';
import { canBuildRoad, ROAD_COST } from './roads';
import { canBuildBridge, BRIDGE_COST } from './bridges';
import { bonusEligibleFor } from './bonus';

const CHEAPEST_UNIT_PRICE = Math.min(
  ...Object.values(UNIT_TYPES)
    .filter((t) => t.price > 0)
    .map((t) => t.price),
);

/** True when the player can take at least one action anywhere this turn. */
export function hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean {
  const canClimb = hasSkill(player, 'climbing');
  const canDock = hasSkill(player, 'navigation');

  for (const tile of map.tiles) {
    const unit = tile.unit;

    if (unit && unit.owner === player.index) {
      if (
        (canMove(unit) && reachableTargets(map, unit, undefined, canClimb, canDock, player.index).length > 0) ||
        (canAttack(unit) && attackableTargets(map, unit, player.index).length > 0) ||
        canHeal(unit)
      ) {
        return true;
      }
    }

    if (
      tile.settlement &&
      tile.settlement.captureReady &&
      tile.settlement.owner !== player.index &&
      unit &&
      unit.owner === player.index
    ) {
      return true;
    }
  }

  for (const tile of map.tiles) {
    if (!tile.settlement || tile.settlement.owner !== player.index) continue;
    if (
      !tile.unit &&
      unitsInVillage(map, tile) < villageCapacity(tile.settlement.level) &&
      player.resources.money >= CHEAPEST_UNIT_PRICE
    ) {
      return true;
    }
    if (canAfford(player.resources, villageUpgradeCost(tile.settlement.level))) return true;
    if (canBuildWall(tile, player)) return true;
  }

  for (const id of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
    if (canOpenSkill(player, id)) return true;
  }

  if (bonusEligibleFor(map, player.index, turn).length > 0) return true;

  for (const tile of map.tiles) {
    if (canBuildSawmill(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.sawmill)) return true;
    if (canBuildMine(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.mine)) return true;
    if (canBuildPort(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.port)) return true;
    if (canBuildTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.temple)) return true;
    if (canBuildForestTemple(map, tile, player) && canAfford(player.resources, BUILDING_COSTS.forestTemple)) return true;
    if (canBuildRoad(map, tile, player)) return true;
    if (canBuildBridge(map, tile, player) && canAfford(player.resources, BRIDGE_COST)) return true;
  }

  return false;
}