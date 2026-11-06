import { AttackRank, UnitType } from '@enums';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { attackDamage, counterDamageTo, resolveCombat } from '../../units/combat';
import { isShip } from '../../units/ship';
import type { Unit } from '../../units/units';
import { STUN_MIN_DAMAGE } from '../config/tuning';
import { reachableCells } from '../situation/reachable-cells';
import type { AiPlannerState } from '../types/planner-state';
import { key } from '../util/tile-key';

/** One member of the attack group with the way it will strike. */
export interface Member {
  unit: Unit;
  moveTo: MapTile | null;
  rank: AttackRank;
  stun: boolean;
  /** Counter damage the member expects (tie-break within a rank). */
  counter: number;
  /** Expected damage dealt (0 for a stun). */
  damage: number;
}

export function isRanged(unit: Unit): boolean {
  return isShip(unit) || unit.attackDistance > 1 || unit.type === UnitType.CATAPULT;
}

function at(unit: Unit, tile: MapTile | null): Unit {
  return tile ? { ...unit, q: tile.q, r: tile.r } : unit;
}

/** A tile within range of `target` from which `unit` draws no counter-attack
 *  (ranged units out-range a melee defender), or null. */
function freeStrikeTile(map: GameMap, player: Player, unit: Unit, from: MapTile | null, target: MapTile, state: AiPlannerState): MapTile | null | undefined {
  const t = target.unit!;
  if (counterDamageTo(map, at(unit, from), target) === 0 && hexDistance(from ?? unit, target) > t.attackDistance) return from;
  for (const c of reachableCells(map, player, unit)) {
    if (state.occupied.has(key(c.q, c.r))) continue;
    const d = hexDistance(c, target);
    if (d > unit.attackDistance || d <= t.attackDistance) continue;
    return c;
  }
  return undefined;
}

export function rankMember(map: GameMap, player: Player, target: MapTile, a: { unit: Unit; moveTo: MapTile | null }, state: AiPlannerState): Member {
  const enemy = target.unit!;
  const { unit } = a;
  let moveTo = a.moveTo;
  const ghost = at(unit, moveTo);
  const damage = resolveCombat(map, ghost, target).attackerDamage;
  // Stunners freeze a dangerous enemy first: it cannot counter, the rest hit free.
  if (unit.type === UnitType.STUNNER && (enemy.stunTurns ?? 0) < 1 && attackDamage(enemy) >= STUN_MIN_DAMAGE && hexDistance(ghost, target) === 2) {
    return { unit, moveTo, rank: AttackRank.STUN, stun: true, counter: 0, damage: 0 };
  }
  if (isRanged(unit)) {
    const free = freeStrikeTile(map, player, unit, moveTo, target, state);
    if (free !== undefined) {
      moveTo = free;
      return { unit, moveTo, rank: AttackRank.RANGED_FREE, stun: false, counter: 0, damage };
    }
    return { unit, moveTo, rank: AttackRank.RANGED_COUNTERED, stun: false, counter: counterDamageTo(map, ghost, target), damage };
  }
  const counter = counterDamageTo(map, ghost, target);
  const rank = unit.type === UnitType.KNIGHT ? AttackRank.KNIGHT : AttackRank.MELEE;
  return { unit, moveTo, rank, stun: false, counter, damage };
}
