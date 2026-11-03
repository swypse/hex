import { type GameMap, type MapTile } from '../map/map-gen';
import { type Player } from '../players';
import { canAffordAt, payAt } from '../economy/stock';
import { hasSkill } from '../skills';
import { makeUnit, unitSpawnCost } from './units';
import { unitsInVillage, villageCapacity } from '../economy/village';
import { TRIBE_SPECIAL_UNIT } from '../tribes';
import { SkillId, UnitType } from '@enums';

let spawnSeq = 0;

/** Whether `player` may raise a `type` unit on `villageTile` right now: own village,
 *  free and with room, skill and tribe gates, and the price covered. `spawnUnit`
 *  applies exactly these rules. */
export function canSpawnType(map: GameMap, villageTile: MapTile, type: UnitType, player: Player): boolean {
  if (!spawnAllowed(map, villageTile, type, player)) return false;
  return canAffordAt(map, player, villageTile, unitSpawnCost(type));
}

function spawnAllowed(
  map: GameMap,
  villageTile: MapTile,
  type: UnitType,
  player: Player,
): boolean {
  const settlement = villageTile.settlement;
  if (!settlement || settlement.owner !== player.index) return false;
  if (villageTile.unit) return false;
  if (unitsInVillage(map, villageTile) >= villageCapacity(settlement.level)) return false;
  if (type === UnitType.RIDER && !hasSkill(player, SkillId.RIDING)) return false;
  if (type === UnitType.KNIGHT && !hasSkill(player, SkillId.KNIGHTS)) return false;
  if (type === UnitType.SWORDSMAN && !hasSkill(player, SkillId.SWORDSMAN)) return false;
  if (type === UnitType.SHIELD && !hasSkill(player, SkillId.SHIELDS)) return false;
  if (type === UnitType.ARCHER && !hasSkill(player, SkillId.ARCHER)) return false;
  if (type === UnitType.CATAPULT && !hasSkill(player, SkillId.CATAPULT)) return false;
  // Special units: a tribe's own special is allowed with no skill; another
  // tribe's special is never allowed.
  if (TRIBE_SPECIAL_UNIT[player.tribe] === type) {
    // tribe-gated: OK
  } else if (Object.values(TRIBE_SPECIAL_UNIT).includes(type)) {
    return false;
  }
  return true;
}

export function spawnUnit(
  map: GameMap,
  villageTile: MapTile,
  type: UnitType,
  player: Player,
): boolean {
  if (!spawnAllowed(map, villageTile, type, player)) return false;
  const cost = unitSpawnCost(type);
  if (!payAt(map, player, villageTile, cost)) return false;

  villageTile.unit = makeUnit(player.index, type, villageTile.q, villageTile.r, {
    // Date.now() alone collides when several villages spawn in the same
    // millisecond (e.g. one AI turn); the per-game sequence keeps ids unique.
    id: `spawn-${Date.now()}-${spawnSeq++}`,
    hasMoved: true,
    hasAttacked: true,
    hasHealed: true,
    spawnVillage: { q: villageTile.q, r: villageTile.r },
  });
  return true;
}
