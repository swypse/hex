import type { MapTile } from './mapGen';
import type { Player } from './players';
import { canAfford, pay } from './resources';
import type { Unit } from './units';

export const SHIP_MOVEMENT: Record<1 | 2 | 3, number> = { 1: 2, 2: 3, 3: 4 };
export const SHIP_ATTACK: Record<1 | 2 | 3, number> = { 1: 10, 2: 20, 3: 30 };
export const SHIP_ATTACK_DISTANCE: Record<1 | 2 | 3, number> = { 1: 2, 2: 2, 3: 3 };
export const SHIP_UPGRADE_COST: Record<2 | 3, { money: number; wood: number; ore: number }> = {
  2: { money: 8, wood: 4, ore: 0 },
  3: { money: 16, wood: 8, ore: 2 },
};

export function isShip(unit: Unit): boolean {
  return unit.shipLevel !== undefined;
}

export function shipMovement(unit: Unit): number {
  return SHIP_MOVEMENT[unit.shipLevel!];
}

export function shipAttack(unit: Unit): number {
  if (unit.shipLevel === undefined) return unit.attack;
  return SHIP_ATTACK[unit.shipLevel];
}

export function shipAttackDistance(unit: Unit): number {
  if (unit.shipLevel === undefined) return unit.attackDistance;
  return SHIP_ATTACK_DISTANCE[unit.shipLevel];
}

export function canUpgradeShip(unit: Unit, tile: MapTile, player: Player): boolean {
  if (unit.shipLevel === undefined || unit.shipLevel >= 3) return false;
  if (tile.ownedBy !== player.index) return false;
  const cost = SHIP_UPGRADE_COST[(unit.shipLevel + 1) as 2 | 3];
  return canAfford(player.resources, { wood: cost.wood, stone: 0, money: cost.money, ore: cost.ore });
}

export function upgradeShip(unit: Unit, tile: MapTile, player: Player): boolean {
  if (!canUpgradeShip(unit, tile, player)) return false;
  const cost = SHIP_UPGRADE_COST[(unit.shipLevel! + 1) as 2 | 3];
  player.resources = pay(player.resources, { wood: cost.wood, stone: 0, money: cost.money, ore: cost.ore });
  unit.shipLevel = (unit.shipLevel! + 1) as 1 | 2 | 3;
  return true;
}

export function gainShipAbility(unit: Unit): void {
  unit.shipLevel = 1;
}

export function revertShip(unit: Unit): void {
  delete unit.shipLevel;
}
