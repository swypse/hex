import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { isShip, shipAttack, shipAttackDistance } from './ship';
import { isExploredFor } from './explore';
import { hasSkill } from './skills';
import type { Player } from './players';
import { UNIT_TYPES, Unit } from './units';
import { damageReduction } from './buffs';

export interface AttackResult {
  attackerDamage: number;
  targetDamage: number;
  attackerDied: boolean;
  targetDied: boolean;
  missed: boolean;
}

export const MISS_CHANCE = 0.1;
export const SCIENCE_MISS_CHANCE = 0.05;
export const MIN_DAMAGE = 10;

export function missChanceFor(player: Player): number {
  return hasSkill(player, 'science') ? SCIENCE_MISS_CHANCE : MISS_CHANCE;
}

export function attackDamage(attacker: Unit): number {
  return Math.round((shipAttack(attacker) * attacker.hp) / UNIT_TYPES[attacker.type].maxHp);
}

export function rollAttackDamage(attacker: Unit, rng: () => number): number {
  if (attacker.type === 'catapult') return 40 + Math.floor(rng() * 21);
  return attackDamage(attacker);
}

export function counterAttackDamage(unit: Unit): number {
  const base = unit.type === 'shield' ? 50 : shipAttack(unit);
  return Math.round((base * unit.hp) / UNIT_TYPES[unit.type].maxHp);
}

export function attackableTargets(map: GameMap, unit: Unit, playerIndex = 0): MapTile[] {
  return map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > shipAttackDistance(unit)) return false;
    if (!isExploredFor(t, playerIndex)) return false;
    return true;
  });
}

export function chooseBestAttack(map: GameMap, unit: Unit, playerIndex = 0): MapTile | null {
  const targets = attackableTargets(map, unit, playerIndex);
  let best: MapTile | null = null;
  let bestScore = -Infinity;
  for (const t of targets) {
    const target = t.unit!;
    const dmg = attackDamage(unit);
    let s = 0;
    if (dmg >= target.hp) s += 500;
    s += (UNIT_TYPES[target.type].maxHp - target.hp) * 3;
    if (target.type === 'swordsman') s += 80;
    if (target.type === 'archer') s += 60;
    if (target.shipLevel !== undefined) s += 90;
    if (t.settlement && t.settlement.owner !== unit.owner) s += 150;
    const dist = hexDistance({ q: unit.q, r: unit.r }, { q: t.q, r: t.r });
    if (dist > target.attackDistance) s += 40;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

export function tradeIsFavorable(attacker: Unit, targetTile: MapTile): boolean {
  const target = targetTile.unit;
  if (!target) return true;
  if (attackDamage(attacker) >= target.hp) return true;
  const dist = hexDistance({ q: attacker.q, r: attacker.r }, { q: target.q, r: target.r });
  if (dist > shipAttackDistance(target)) return true; // no counter available
  return attackDamage(attacker) >= counterAttackDamage(target);
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
    if (attacker.type === 'rider') attacker.hasMoved = false;
    return {
      attackerDamage: 0,
      targetDamage: 0,
      attackerDied: false,
      targetDied: false,
      missed: true,
    };
  }

  const attackerDamage = Math.max(
    MIN_DAMAGE,
    rollAttackDamage(attacker, rng) - (targetUnit.defence ?? 0) - damageReduction(map, targetUnit, target),
  );
  const targetDied = targetUnit.hp - attackerDamage <= 0;
  targetUnit.hp = Math.max(0, targetUnit.hp - attackerDamage);
  attacker.hasAttacked = true;
  if (attacker.type === 'rider') attacker.hasMoved = false;

  let targetDamage = 0;
  let attackerDied = false;
  const distance = hexDistance(
    { q: attacker.q, r: attacker.r },
    { q: target.q, r: target.r },
  );
  if (!targetDied && distance <= targetUnit.attackDistance) {
    const counterReduction = attackerTile ? damageReduction(map, attacker, attackerTile) : 0;
    targetDamage = Math.max(MIN_DAMAGE, counterAttackDamage(targetUnit) - (attacker.defence ?? 0) - counterReduction);
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }

  if (targetDied) {
    target.unit = null;
    if (attackerTile && attacker.type !== 'archer' && attacker.type !== 'catapult' && attacker.type !== 'pirate' && targetUnit.type !== 'pirate' && !isShip(attacker) && !isShip(targetUnit)) {
      attackerTile.unit = null;
      attacker.q = target.q;
      attacker.r = target.r;
      target.unit = attacker;
    }
  }
  if (attackerDied) {
    if (attackerTile) attackerTile.unit = null;
  }

  return { attackerDamage, targetDamage, attackerDied, targetDied, missed: false };
}
