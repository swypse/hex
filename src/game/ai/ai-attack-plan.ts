import { type MapTile, type GameMap } from '../map/map-gen';
import { hexDistance } from '../map/hex';
import { hasSkill } from '../skills';
import { type Player } from '../players';
import { attackDamage, counterDamageTo, resolveCombat } from '../units/combat';
import { reachableTargets } from '../units/selection';
import { isShip } from '../units/ship';
import { type Unit } from '../units/units';
import { type AiAction, type AiPlannerState } from './ai-types';
import { STUN_MIN_DAMAGE, guardGarrisonAttack, key } from './ai-pattern-helpers';
import { AiActionType, AttackRank, GarrisonGuardKind, SkillId, UnitType } from '@enums';

/** Expected damage must reach this multiple of the target's hp: misses happen. */
export const KILL_MARGIN = 1.15;

/** One member of the attack group with the way it will strike. */
interface Member {
  unit: Unit;
  moveTo: MapTile | null;
  rank: AttackRank;
  stun: boolean;
  /** Counter damage the member expects (tie-break within a rank). */
  counter: number;
  /** Expected damage dealt (0 for a stun). */
  damage: number;
}

function isRanged(unit: Unit): boolean {
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
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  const canDock = hasSkill(player, SkillId.NAVIGATION);
  for (const c of reachableTargets(map, unit, undefined, canClimb, canDock, player.index)) {
    if (state.occupied.has(key(c.q, c.r))) continue;
    const d = hexDistance(c, target);
    if (d > unit.attackDistance || d <= t.attackDistance) continue;
    return c;
  }
  return undefined;
}

function rankMember(map: GameMap, player: Player, target: MapTile, a: { unit: Unit; moveTo: MapTile | null }, state: AiPlannerState): Member {
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

/** Units that could step onto `village` once its defender is gone (not the
 *  attackers' own picks), nearest first. */
function villageEnterers(map: GameMap, player: Player, village: MapTile, pool: Unit[], state: AiPlannerState): Unit[] {
  const defender = village.unit;
  village.unit = null;
  const canClimb = hasSkill(player, SkillId.CLIMBING);
  const canDock = hasSkill(player, SkillId.NAVIGATION);
  const out = pool
    .filter((u) => !isShip(u) && reachableTargets(map, u, undefined, canClimb, canDock, player.index).some((c) => c.q === village.q && c.r === village.r))
    .sort((x, y) => hexDistance(x, village) - hexDistance(y, village));
  village.unit = defender;
  return out.filter((u) => !state.acted.has(u.id));
}

/** What a gang-up on `target` is expected to do, from the real combat formula
 *  (defense, terrain, wounded attackers): total damage dealt, counter damage
 *  the attackers take, and whether the damage clears the kill margin. */
export function gangForecast(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
): { damage: number; counter: number; lethal: boolean } {
  const members = attackers.map((a) => rankMember(map, player, target, a, state));
  const damage = members.reduce((s, m) => s + m.damage, 0);
  const counter = members.reduce((s, m) => s + m.counter, 0);
  return { damage, counter, lethal: damage >= target.unit!.hp * KILL_MARGIN };
}

/** Plans one coordinated attack on `target` by the units that can reach it.
 *
 *  Order: stunners, ranged units that take no counter, knights, other melee
 *  (least counter damage first), ranged units that do take a counter. Only as
 *  many units as the kill needs attack; the rest stay free. When the target
 *  stands in an enemy village, one unit that can step onto it is held back
 *  (reserved in `state.entry`) so it takes the cell if the defender dies. */
export function planGangAttack(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
  spare: Unit[] = [],
): AiAction[] {
  const enemy = target.unit;
  if (!enemy) return [];
  const members = attackers
    .map((a) => rankMember(map, player, target, a, state))
    .sort((x, y) => x.rank - y.rank || x.counter - y.counter || y.damage - x.damage);

  // Take attackers in order until the expected damage kills the target.
  let chosen: Member[] = [];
  let sum = 0;
  for (const m of members) {
    chosen.push(m);
    sum += m.damage;
    if (sum >= enemy.hp * KILL_MARGIN) break;
  }
  const lethal = sum >= enemy.hp;

  // Village target: hold one unit back to take the cell.
  const village = target.settlement && target.settlement.owner !== player.index ? target : null;
  let entrant: Unit | null = null;
  if (village && lethal) {
    const chosenIds = new Set(chosen.map((m) => m.unit.id));
    const idle = [...members.map((m) => m.unit).filter((u) => !chosenIds.has(u.id)), ...spare];
    entrant = villageEnterers(map, player, village, idle, state)[0] ?? null;
    if (!entrant) {
      // No spare unit: give up the last melee finisher that is not needed for the kill.
      for (let i = chosen.length - 1; i >= 0; i--) {
        const m = chosen[i]!;
        if (isRanged(m.unit) || sum - m.damage < enemy.hp * KILL_MARGIN) continue;
        if (villageEnterers(map, player, village, [m.unit], state).length === 0) continue;
        entrant = m.unit;
        chosen = chosen.filter((x) => x !== m);
        break;
      }
    }
  }

  const actions: AiAction[] = [];
  for (const m of chosen) {
    const guard = m.moveTo ? null : guardGarrisonAttack(map, player, m.unit, target, state);
    if (guard?.kind === GarrisonGuardKind.HOLD) continue;
    if (m.moveTo) actions.push({ type: AiActionType.MOVE, unitId: m.unit.id, q: m.moveTo.q, r: m.moveTo.r });
    actions.push(
      m.stun
        ? { type: AiActionType.STUN, unitId: m.unit.id, q: target.q, r: target.r }
        : { type: AiActionType.ATTACK, unitId: m.unit.id, q: target.q, r: target.r },
    );
    if (guard?.guardType) {
      const home = map.tiles.find((x) => x.unit === m.unit);
      if (home) actions.push({ type: AiActionType.SPAWN, q: home.q, r: home.r, unitType: guard.guardType });
    }
  }
  if (entrant && village && actions.length > 0) {
    (state.entry ??= []).push({ unitId: entrant.id, q: village.q, r: village.r });
    state.moved.add(entrant.id);
  }
  return actions;
}
