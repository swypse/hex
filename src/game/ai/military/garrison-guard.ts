import { GarrisonGuardKind, SpawnPreference, UnitType } from '@enums';
import { unitsInVillage, villageCapacity } from '../../economy/village';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { attackDamage, counterDamageTo as counterDamageToFromCombat } from '../../units/combat';
import { isShip } from '../../units/ship';
import type { Unit } from '../../units/units';
import { landEnemyCanReach } from '../situation/enemy-reach';
import { bestSpawnableUnitType } from '../spawn/best-spawnable-unit-type';
import type { AiPlannerState } from '../types/planner-state';
import { key } from '../util/tile-key';

/** Counter damage an attack on `target` would draw back onto `attacker` (0
 *  when the target dies, is out of range, or cannot counter), mirroring
 *  performAttack's exact formula: the target's defense force shares the
 *  incoming attack force, so its retaliation is the defense result. */
function counterDamageTo(
  map: GameMap,
  attacker: Unit,
  attackerTile: MapTile,
  targetTile: MapTile,
): number {
  return counterDamageToFromCombat(map, attacker, targetTile);
}

/** Units that step onto the tile of an enemy they kill (see `performAttack`). */
function isMeleeAdvancer(unit: Unit): boolean {
  return unit.type !== UnitType.ARCHER && unit.type !== UnitType.CATAPULT && unit.type !== UnitType.PIRATE && !isShip(unit);
}

export type GarrisonGuardResult = { kind: GarrisonGuardKind.ATTACK; guardType?: UnitType } | { kind: GarrisonGuardKind.HOLD };

/** A unit standing on its own village must never trade its life for a kill if
 *  that would leave the village with no garrison and no way to replace one.
 *  - `{ kind: 'hold' }`: the enemy counter would kill the garrison and no
 *    fresh defender can be spawned on the village right after — hold instead.
 *  - `{ kind: 'attack', guardType }`: the attack may proceed, but the caller
 *    must *also* plan a spawn so the village is covered if the garrison dies.
 *  - `{ kind: 'attack' }`: either the attack cannot kill the garrison, or the
 *    unit is not on its own village — no guard required. */
export function guardGarrisonAttack(
  map: GameMap,
  player: Player,
  unit: Unit,
  targetTile: MapTile,
  state?: AiPlannerState,
): GarrisonGuardResult {
  const tile = map.tiles.find((t) => t.unit === unit);
  if (!tile?.settlement || tile.settlement.owner !== player.index) return { kind: GarrisonGuardKind.ATTACK };
  // A catapult siege of a structure tile draws no counter at all.
  if (!targetTile.unit) return { kind: GarrisonGuardKind.ATTACK };
  // A melee kill also vacates the village: the winner advances onto the dead enemy's tile.
  const advances = isMeleeAdvancer(unit) && targetTile.unit.owner >= 0 && attackDamage(unit) >= targetTile.unit.hp;
  const vacates = advances && landEnemyCanReach(map, tile, player.index);
  if (!vacates && counterDamageTo(map, unit, tile, targetTile) < unit.hp) return { kind: GarrisonGuardKind.ATTACK };

  const vk = key(tile.q, tile.r);
  if (state?.occupied.has(vk)) return { kind: GarrisonGuardKind.HOLD };
  // A dying garrison frees a spawn slot (an advancing one keeps its own): a guard fits as long as the
  // village is not already at capacity with its other spawns.
  const garrisonHome = unit.spawnVillage !== null && key(unit.spawnVillage.q, unit.spawnVillage.r) === vk;
  const stayed = unitsInVillage(map, tile) - (garrisonHome && !vacates ? 1 : 0);
  if (stayed >= villageCapacity(tile.settlement.level)) return { kind: GarrisonGuardKind.HOLD };
  const guardType = bestSpawnableUnitType(player, SpawnPreference.DEFENSE, map, tile);
  if (!guardType) return { kind: GarrisonGuardKind.HOLD };
  return { kind: GarrisonGuardKind.ATTACK, guardType };
}
