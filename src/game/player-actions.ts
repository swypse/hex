import { type GameMap } from './map/map-gen';
import type { Player } from './players';
import { canMove, canAttack, canHeal, UNIT_TYPES } from './units/units';
import { reachableTargets } from './units/selection';
import { attackableTargets } from './units/combat';
import { hasSkill, canOpenSkill, SKILLS } from './skills';
import { unitsInVillage, villageCapacity, canBuildWall } from './economy/village';
import { villageUpgradeCost } from './economy/resources';
import { canAffordAt } from './economy/stock';
import {
  canBuildSawmill,
  canBuildMine,
  canBuildPort,
  canBuildTemple,
  canBuildForestTemple,
  canBuildFarm,
  canBuildGranary,
  canBurnBuilding,
  canBurnRoad,
  BUILDING_COSTS,
} from './economy/buildings';
import { canBuildRoad, villageConnectedNodes } from './economy/roads';
import { canBuildBridge, BRIDGE_COST } from './economy/bridges';
import { bonusEligibleFor } from './map/bonus';
import { bottleCollectableFor } from './map/bottles';
import { SkillId } from '@enums';

const CHEAPEST_UNIT_PRICE = Math.min(
  ...Object.values(UNIT_TYPES)
    .filter((t) => t.price > 0)
    .map((t) => t.price),
);

/** True when the player can take at least one action anywhere this turn. */
export function hasAnyAvailableAction(map: GameMap, player: Player, turn: number): boolean {
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  const canDock = hasSkill(player, SkillId.NAVIGATION);

  for (const tile of map.tiles) {
    const unit = tile.unit;

    if (unit && unit.owner === player.index) {
      if (
        (canMove(unit) && reachableTargets(map, unit, undefined, canClimb, canDock, player.index).length > 0) ||
        (canAttack(unit) && attackableTargets(map, unit, player.index).length > 0) ||
        canHeal(unit) ||
        canBurnBuilding(tile, unit) ||
        canBurnRoad(tile, unit)
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
    if (canAffordAt(map, player, tile, villageUpgradeCost(tile.settlement.level))) return true;
    if (canBuildWall(map, tile, player)) return true;
  }

  for (const id of Object.keys(SKILLS) as (keyof typeof SKILLS)[]) {
    if (canOpenSkill(player, id, map)) return true;
  }

  if (bonusEligibleFor(map, player.index, turn).length > 0) return true;

  if (bottleCollectableFor(map, player.index, turn).length > 0) return true;

  const roadConnected = villageConnectedNodes(map, player.index);
  for (const tile of map.tiles) {
    if (canBuildSawmill(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.sawmill)) return true;
    if (canBuildMine(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.mine)) return true;
    if (canBuildPort(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.port)) return true;
    if (canBuildTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.temple)) return true;
    if (canBuildForestTemple(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.forestTemple)) return true;
    if (canBuildFarm(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.farm)) return true;
    if (canBuildGranary(map, tile, player) && canAffordAt(map, player, tile, BUILDING_COSTS.granary)) return true;
    if (canBuildRoad(map, tile, player, roadConnected)) return true;
    if (canBuildBridge(map, tile, player) && canAffordAt(map, player, tile, BRIDGE_COST)) return true;
  }

  return false;
}