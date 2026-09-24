import { hexDistance } from './hex';
import { GameMap } from './map-gen';
import { isShip, shipAttack } from './ship';
import { UNIT_TYPES, Unit } from './units';

export const BANNER_BONUS = 10;
export const RAGE_BONUS = 20;
export const RAGE_THRESHOLD_PCT = 0.5;

export function isStunned(unit: Unit): boolean {
  return (unit.stunTurns ?? 0) >= 1;
}

/** +20 atk while the unit has <= 50% max hp (berserker rage), else 0. */
export function berserkerRage(unit: Unit): number {
  if (unit.type !== 'berserker') return 0;
  return unit.hp <= UNIT_TYPES.berserker.maxHp * RAGE_THRESHOLD_PCT ? RAGE_BONUS : 0;
}

/** +10 atk for a unit within distance 2 of any friendly banner (never the
 *  banner itself, never ships). Non-stacking: always a flat +10. */
export function bannerAttackBonus(map: GameMap | null, unit: Unit): number {
  if (!map || isShip(unit)) return 0;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.type !== 'banner' || t.unit.owner !== unit.owner) continue;
    if (t.unit === unit) continue;
    if (hexDistance(unit, t) <= 2) return BANNER_BONUS;
  }
  return 0;
}

/** Base attack before any bonus: SHIP_ATTACK at sea, else the unit's own
 *  attack snapshot (shipAttack() already does both). */
export function baseAttack(unit: Unit): number {
  return shipAttack(unit);
}

/** Any current atk bonus (banner +10 / rage +20); ships get none. Used for the
 *  hp-bar icon and HUD. */
export function attackBonus(unit: Unit, map: GameMap | null): number {
  if (isShip(unit)) return 0;
  return bannerAttackBonus(map, unit) + berserkerRage(unit);
}

export function effectiveAttack(unit: Unit, map: GameMap | null = null): number {
  return baseAttack(unit) + attackBonus(unit, map);
}