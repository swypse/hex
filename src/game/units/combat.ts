import { hexDistance } from '../map/hex';
import { type GameMap, type MapTile } from '../map/map-gen';
import { isShip, shipAttack, shipAttackDistance } from './ship';
import { isExploredFor } from '../map/explore';
import { hasSkill } from '../skills';
import type { Player } from '../players';
import { unitMaxHp, type Unit } from './units';
import { attackBonus, effectiveAttack, berserkerRage, isStunned } from './abilities';
import { damageReduction } from './buffs';
import { BUILDING_MAX_HP, raidPriority } from '../economy/buildings';
import { SiegeTargetKind, SkillId, UnitType } from '@enums';

interface AttackResult {
  attackerDamage: number;
  targetDamage: number;
  attackerDied: boolean;
  targetDied: boolean;
  missed: boolean;
}

export const MISS_CHANCE = 0.1;
const SCIENCE_MISS_CHANCE = 0.05;

/** Combat scale, derived from this game's own stat block: a
 *  full-HP warrior (attack 20) vs a same-armour warrior (defense 10) trades
 *  at a raw ratio of 20/30 × 20 ≈ 13.3; calibrating that back to the long-
 *  standing warrior trade damage of 20 gives 20 / 13.3 = 1.5. */
export const COMBAT_SCALE = 1.5;
/** Extra multiplier on a counter-attack. The counter is scaled by the defender's
 *  defense, which is small next to attack, so it was too weak next to the blow
 *  that provokes it; this more than doubles it for every unit but the shield. */
export const COUNTER_SCALE = 2.25;
/** A shield's counter-attack multiplier. Kept at its old strength: shields
 *  already retaliate hard, so they do not get COUNTER_SCALE on top. */
export const SHIELD_COUNTER_SCALE = 2;
/** Attack multiplier of a stealthed unit's strike (the stalker's sneak attack). */
export const SNEAK_ATTACK_MULT = 2;

export function missChanceFor(player: Player): number {
  return hasSkill(player, SkillId.SCIENCE) ? SCIENCE_MISS_CHANCE : MISS_CHANCE;
}

/** Raw attack force: attack × current hp ratio (no defense applied). The
 *  attack value includes banner-aura (+5) and berserker-rage (+15) bonuses. */
export function attackDamage(attacker: Unit): number {
  return Math.round((effectiveAttack(attacker) * attacker.hp) / unitMaxHp(attacker));
}

/** Terrain/protection bonus applied to the defender's defense force.
 *  `1 + reduction / 10`: own village (5) → ×1.5, walled village (+3 → ×1.8),
 *  temple protections (+10 → ×2.0). */
export function defenseBonusFor(map: GameMap | null, unit: Unit, tile: MapTile): number {
  if (!map || unit.owner < 0) return 1;
  return 1 + damageReduction(map, unit, tile) / 10;
}

export interface CombatResolution {
  attackerDamage: number;
  counterDamage: number;
}

/** Force-ratio resolution for one attack, pure (no mutation):
 *      attackForce  = attacker.attack  × attacker.hp / maxHp
 *      defenseForce = defender.defense × defender.hp / maxHp × defenseBonus
 *      total        = attackForce + defenseForce
 *      attackerDamage = round(attackForce / total × attacker.attack  × COMBAT_SCALE)
 *      counterDamage  = round(defenseForce / total × defender.defense × COMBAT_SCALE × COUNTER_SCALE)
 *  A shield counters with SHIELD_COUNTER_SCALE instead of COUNTER_SCALE: wall of
 *  steel, it is dangerous to hit a shield unit head-on (its retaliation uses a
 *  high defense force, so attackers think twice). */
export function resolveCombat(map: GameMap | null, attacker: Unit, target: MapTile, ignoreBuffs = false): CombatResolution {
  const defender = target.unit!;
  // A stealthed stalker's strike hits for double (sneak attack).
  const sneak = !ignoreBuffs && attacker.isStealthed === true;
  const def = defender.defense ?? 0;
  // Banner aura / berserker rage raise the attack power. Ships receive no
  // bonuses (attackBonus returns 0 at sea), so their numbers stay unchanged.
  const bonus = ignoreBuffs ? 0 : attackBonus(attacker, map);
  const attackForce = ((shipAttack(attacker) + bonus) * (sneak ? SNEAK_ATTACK_MULT : 1) * attacker.hp) / unitMaxHp(attacker);
  const defenseForce =
    (def * defender.hp) / unitMaxHp(defender) *
    defenseBonusFor(map, defender, target);
  const total = attackForce + defenseForce;
  if (total <= 0) return { attackerDamage: 0, counterDamage: 0 };
  // The damage scale keeps the legacy "crew attack" term (attacker.attack)
  // so a ship's counter math is unchanged, while bonuses apply on top.
  const scaleAttack = (attacker.attack + bonus) * (sneak ? SNEAK_ATTACK_MULT : 1);
  const attackerDamage = Math.round((attackForce / total) * scaleAttack * COMBAT_SCALE);
  const counterMult = defender.type === UnitType.SHIELD && !isShip(defender) ? SHIELD_COUNTER_SCALE : COUNTER_SCALE;
  const counterDamage = Math.round((defenseForce / total) * def * COMBAT_SCALE * counterMult);
  return { attackerDamage, counterDamage };
}

/** Split of the damage `attacker` would deal into the part it deals unbuffed and the extra from
 *  its buff (sneak attack, or banner / rage / veteran bonus); null when it has no buff effect. */
export function attackBuffSplit(map: GameMap | null, attacker: Unit, target: MapTile): { base: number; extra: number; sneak: boolean } | null {
  const total = resolveCombat(map, attacker, target).attackerDamage;
  const base = resolveCombat(map, attacker, target, true).attackerDamage;
  if (total <= base) return null;
  return { base, extra: total - base, sneak: attacker.isStealthed === true };
}

/** Whether a unit retaliates when it survives an attack. Land catapults never
 *  counter-attack; a raging berserker takes no counter-attacks; a stunned unit
 *  is too dazed to fight back; aboard a ship the crew fights back with the
 *  ship's cannon. */
export function canCounterAttack(unit: Unit): boolean {
  if (isStunned(unit)) return false;
  if (berserkerRage(unit) > 0) return false;
  return !(unit.type === UnitType.CATAPULT && !isShip(unit));
}

/** Counter damage an attack on `target` would draw back onto `attacker` (0
 *  when the target dies, is out of range, or cannot counter), mirroring
 *  performAttack's exact formula: the target's defense force shares the
 *  incoming attack force, so its retaliation is the defense result. */
export function counterDamageTo(
  map: GameMap,
  attacker: Unit,
  targetTile: MapTile,
): number {
  const target = targetTile.unit!;
  const { attackerDamage, counterDamage } = resolveCombat(map, attacker, targetTile);
  if (attackerDamage >= target.hp) return 0;
  const dist = hexDistance({ q: attacker.q, r: attacker.r }, targetTile);
  if (dist > (target.attackDistance ?? 0)) return 0;
  if (!canCounterAttack(target)) return 0;
  return counterDamage;
}

/** Whether a tile holds an enemy attackable structure (village, building, or
 *  bridge) for a catapult siege. Enemy units on the tile are handled by the
 *  regular unit-attack path instead. */
export function isEnemySiegeTarget(t: MapTile, attackerOwner: number): boolean {
  if (t.settlement && t.settlement.owner !== null && t.settlement.owner !== attackerOwner) return true;
  if (t.building && t.ownedBy !== null && t.ownedBy !== attackerOwner) return true;
  if (t.bridge !== undefined && t.bridge !== null && t.bridge.owner !== attackerOwner) return true;
  if (t.roadOwner !== null && t.roadOwner !== undefined && t.roadOwner !== attackerOwner) return true;
  return false;
}

/** A road or bridge on a tile nobody owns: a catapult may break it whoever built
 *  it. (Only a player's own targeting, not the AI's: it never wrecks its own roads.) */
export function isFreeSiegeTarget(t: MapTile): boolean {
  if (t.ownedBy !== null && t.ownedBy !== undefined) return false;
  if (t.settlement) return false;
  return (t.bridge !== undefined && t.bridge !== null) || (t.roadOwner !== null && t.roadOwner !== undefined);
}

interface SiegeOutcome {
  missed: boolean;
  /** The structure destroyed on a hit: a village level, its wall, a building,
   *  or a bridge. `null` when nothing was hit (or a building was merely
   *  damaged, not destroyed). */
  destroyed: SiegeTargetKind | null;
  /** Remaining hp of a building hit by the volley (undefined for non-building
   *  or non-damaging hits). */
  buildingHp?: number;
}

/** A catapult volley against a structure tile. Misses apply the same chance as
 *  a regular attack; a hit destroys the target's outermost defence layer:
 *  a built wall first, then the village itself (downgrade -1 level, min 1),
 *  or removes a standalone building / bridge / road outright (a building on the
 *  same tile goes before its road). No counter-attack. */
export function performSiege(catapult: Unit, target: MapTile, rng: () => number = Math.random, missChance: number = MISS_CHANCE): SiegeOutcome {
  catapult.hasAttacked = true;
  if (rng() < missChance) {
    return { missed: true, destroyed: null };
  }
  const s = target.settlement;
  if (s && s.owner !== null && s.owner !== catapult.owner) {
    if (s.wall) {
      s.wall = false;
      return { missed: false, destroyed: SiegeTargetKind.WALL };
    }
    if (s.level > 1) {
      s.level -= 1;
    }
    return { missed: false, destroyed: SiegeTargetKind.VILLAGE };
  }
  if (target.building && target.ownedBy !== null && target.ownedBy !== catapult.owner) {
    // A building takes 1 damage per hit and is removed once its hp reaches 0.
    const hp = (target.building.hp ?? BUILDING_MAX_HP) - 1;
    if (hp <= 0) {
      target.building = null;
      return { missed: false, destroyed: SiegeTargetKind.BUILDING, buildingHp: 0 };
    }
    target.building.hp = hp;
    return { missed: false, destroyed: null, buildingHp: hp };
  }
  const freeTile = target.ownedBy === null || target.ownedBy === undefined;
  if (target.bridge !== undefined && target.bridge !== null && (target.bridge.owner !== catapult.owner || freeTile)) {
    target.bridge = null;
    target.roadOwner = null;
    return { missed: false, destroyed: SiegeTargetKind.BRIDGE };
  }
  // A road is hit last: a building on the same tile is destroyed first.
  if (target.roadOwner !== null && target.roadOwner !== undefined && (target.roadOwner !== catapult.owner || freeTile)) {
    target.roadOwner = null;
    return { missed: false, destroyed: SiegeTargetKind.ROAD };
  }
  // A free/unclaimed structure: the volley still resolves (marks the catapult
  // as attacked) but has no effect.
  return { missed: false, destroyed: null };
}

/** Tiles `unit` can attack. `includeFreeStructures` (a player's own targeting) also
 *  lists roads and bridges on unowned tiles for a catapult; the AI leaves it off. */
export function attackableTargets(map: GameMap, unit: Unit, playerIndex = 0, includeFreeStructures = false): MapTile[] {
  const result = map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.isStealthed === true) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) return false;
    if (!isExploredFor(t, playerIndex)) return false;
    return true;
  });
  // Land catapults are the sole siege unit: they can also target enemy
  // buildings (villages, mines, sawmills, ports, temples, bridges) within
  // their attack range, using the same range/fog logic as enemy units.
  if (unit.type === UnitType.CATAPULT) {
    for (const t of map.tiles) {
      if (t.unit) continue;
      if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) continue;
      if (!isExploredFor(t, playerIndex)) continue;
      if (isEnemySiegeTarget(t, unit.owner) || (includeFreeStructures && isFreeSiegeTarget(t))) result.push(t);
    }
  }
  return result;
}

/** Best structure tile for a catapult, or null when none are reachable. Only
 *  called once no enemy units are available, so the AI sieges villages and
 *  production buildings rather than sitting idle. Villages (and their walls)
 *  are worth more than a standalone building; a bridge is last. */
function chooseBestSiegeTarget(map: GameMap, unit: Unit, playerIndex = 0): MapTile | null {
  if (unit.type !== UnitType.CATAPULT) return null;
  let best: MapTile | null = null;
  let bestScore = -Infinity;
  for (const t of map.tiles) {
    if (t.unit) continue; // unit targets are handled by chooseBestAttack
    if (!isEnemySiegeTarget(t, unit.owner)) continue;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) continue;
    if (!isExploredFor(t, playerIndex)) continue;
    let s = 0;
    if (t.settlement) {
      s = 400 + t.settlement.level * 50;
      if (t.settlement.wall) s += 80;
    } else if (t.building) {
      // Production and food buildings first (granary > university > farm > mine > sawmill).
      s = 150 + raidPriority(t.building.kind) * 8;
    } else if (t.bridge !== undefined && t.bridge !== null) {
      s = 80;
    } else {
      s = 60; // a road
    }
    const dist = hexDistance({ q: unit.q, r: unit.r }, t);
    s += shipAttackDistance(unit) - dist;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

/** An enemy trapper (44 hp, defense 8, a hard counter) is a poor target for a
 *  melee unit that cannot kill it outright: archers and catapults should wear
 *  it down and melee only finish it, taking no counter. A raging berserker
 *  takes no counter and ships fire from range, so neither is held back. */
export function isPoorTrapperTarget(attacker: Unit, target: Unit): boolean {
  if (target.type !== UnitType.TRAPPER) return false;
  if (attacker.attackDistance > 1 || isShip(attacker) || berserkerRage(attacker) > 0) return false;
  return attackDamage(attacker) < target.hp;
}

export function chooseBestAttack(map: GameMap, unit: Unit, playerIndex = 0): MapTile | null {
  const targets = attackableTargets(map, unit, playerIndex);
  let best: MapTile | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    // A catapult may also see structure tiles (siege) among its targets; the
    // AI prefers unit targets, handling those in the fallback below.
    if (!t.unit) continue;
    const target = t.unit!;
    if (isPoorTrapperTarget(unit, target)) continue;
    const dmg = attackDamage(unit);
    let s = 0;
    if (dmg >= target.hp) s += 500;
    s += (unitMaxHp(target) - target.hp) * 3;
    if (target.type === UnitType.SWORDSMAN) s += 80;
    if (target.type === UnitType.ARCHER) s += 60;
    if (target.shipLevel !== undefined) s += 90;
    if (t.settlement && t.settlement.owner !== unit.owner) s += 150;
    const dist = hexDistance({ q: unit.q, r: unit.r }, { q: t.q, r: t.r });
    if (dist > target.attackDistance || !canCounterAttack(target)) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  if (best) return best;
  // No enemy units in reach: a catapult idles into a siege of the best
  // reachable enemy structure (village/building/bridge).
  return chooseBestSiegeTarget(map, unit, playerIndex);
}

export function tradeIsFavorable(attacker: Unit, targetTile: MapTile): boolean {
  const target = targetTile.unit;
  if (!target) return true;
  const { attackerDamage, counterDamage } = resolveCombat(null, attacker, targetTile);
  if (attackerDamage >= target.hp) return true;
  const dist = hexDistance({ q: attacker.q, r: attacker.r }, { q: target.q, r: target.r });
  if (dist > shipAttackDistance(target)) return true; // no counter available
  if (!canCounterAttack(target)) return true;
  return attackerDamage >= counterDamage;
}

export function performAttack(
  map: GameMap,
  attacker: Unit,
  target: MapTile,
  rng: () => number = Math.random,
  missChance: number = MISS_CHANCE,
): AttackResult {
  const targetUnit = target.unit!;
  const attackerTile = map.tiles.find((t) => t.unit === attacker);

  if (rng() < missChance) {
    attacker.hasAttacked = true;
    if (attacker.type === UnitType.RIDER) attacker.hasMoved = false;
    return {
      attackerDamage: 0,
      targetDamage: 0,
      attackerDied: false,
      targetDied: false,
      missed: true,
    };
  }

  const { attackerDamage, counterDamage } = resolveCombat(map, attacker, target);
  const targetDied = targetUnit.hp - attackerDamage <= 0;
  targetUnit.hp = Math.max(0, targetUnit.hp - attackerDamage);
  attacker.hasAttacked = true;
  if (attacker.type === UnitType.RIDER) attacker.hasMoved = false;

  let targetDamage = 0;
  let attackerDied = false;
  const distance = hexDistance(
    { q: attacker.q, r: attacker.r },
    { q: target.q, r: target.r },
  );
  if (!targetDied && distance <= targetUnit.attackDistance && canCounterAttack(targetUnit)) {
    targetDamage = counterDamage;
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }

  if (targetDied) {
    target.unit = null;
    // A capture-ready village loses readiness the moment its standing unit
    // dies: a fresh melee killer advancing onto it must hold it for a full
    // turn before it can be captured (same rule as a move-out).
    if (target.settlement && target.settlement.owner !== attacker.owner && target.settlement.captureReady) {
      target.settlement.captureReady = false;
    }
    if (attackerTile && attacker.type !== UnitType.ARCHER && attacker.type !== UnitType.CATAPULT && attacker.type !== UnitType.PIRATE && targetUnit.type !== UnitType.PIRATE && !isShip(attacker) && !isShip(targetUnit)) {
      attackerTile.unit = null;
      attacker.q = target.q;
      attacker.r = target.r;
      target.unit = attacker;
    }
  }
  if (attackerDied) {
    if (attackerTile) {
      // A defender who killed the unit that was standing on a capture-ready
      // enemy/free village frees it up: readiness belongs to the standing
      // unit's turn, not to the tile.
      if (attackerTile.settlement && attackerTile.settlement.owner !== attacker.owner && attackerTile.settlement.captureReady) {
        attackerTile.settlement.captureReady = false;
      }
      attackerTile.unit = null;
    }
  }

  return { attackerDamage, targetDamage, attackerDied, targetDied, missed: false };
}
