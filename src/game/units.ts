import { t } from '../i18n';
import { shipMovePoints } from './ship';
import { Tribe } from './tribes';

export type UnitType = 'warrior' | 'rider' | 'archer' | 'swordsman' | 'shield' | 'catapult' | 'knight' | 'pirate';
type PlayableUnitType = Exclude<UnitType, 'pirate'>;

export const PIRATE_OWNER = -1;
export const PIRATE_HP = 80;
export const PIRATE_COLOR = 0x111111;

/** Money cost to strike a deal that stops one pirate ship from attacking the
 *  paying player's tribe. */
export const PIRATE_DEAL_COST = 50;

interface UnitTypeInfo {
  /** Move points a unit type can spend per turn (tile costs are 10-20). */
  movePoints: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  defense: number;
  price: number;
  priceWood: number;
  priceOre: number;
  shape: 'circle' | 'square' | 'triangle' | 'swordsman';
}

export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' },
  rider: { movePoints: 40, attack: 20, attackDistance: 1, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'square' },
  archer: { movePoints: 10, attack: 20, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' },
  swordsman: { movePoints: 10, attack: 40, attackDistance: 1, maxHp: 80, defense: 20, price: 10, priceWood: 0, priceOre: 2, shape: 'swordsman' },
  shield: { movePoints: 10, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2, shape: 'square' },
  catapult: { movePoints: 10, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3, shape: 'square' },
  knight: { movePoints: 30, attack: 40, attackDistance: 1, maxHp: 60, defense: 7, price: 14, priceWood: 0, priceOre: 5, shape: 'swordsman' },
  pirate: { movePoints: 50, attack: 15, attackDistance: 3, maxHp: PIRATE_HP, defense: 5, price: 0, priceWood: 0, priceOre: 0, shape: 'square' },
};

export const UNIT_IMAGE_FILES: Record<Tribe, Record<PlayableUnitType, string>> = {
  [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png', shield: 'cats-shield.png', catapult: 'cats-catapult.png', knight: 'cats-knight.png' },
  [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png', shield: 'warriors-shield.png', catapult: 'warriors-catapult.png', knight: 'warriors-knight.png' },
  [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png', shield: 'villagers-shield.png', catapult: 'villagers-catapult.png', knight: 'villagers-knight.png' },
  [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png', shield: 'barbarians-shield.png', catapult: 'barbarians-catapult.png', knight: 'barbarians-knight.png' },
  [Tribe.Forest]: { warrior: 'forest-warrior.png', rider: 'forest-rider.png', archer: 'forest-archer.png', swordsman: 'forest-swordsman.png', shield: 'forest-shield.png', catapult: 'forest-catapult.png', knight: 'forest-knight.png' },
  [Tribe.Aqua]: { warrior: 'aqua-warrior.png', rider: 'aqua-rider.png', archer: 'aqua-archer.png', swordsman: 'aqua-swordsman.png', shield: 'aqua-shield.png', catapult: 'aqua-catapult.png', knight: 'aqua-knight.png' },
};

export interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
  hasAttacked: boolean;
  hasHealed: boolean;
  hasLanded?: boolean;
  hp: number;
  attack: number;
  attackDistance: number;
  defense?: number;
  spawnVillage: { q: number; r: number } | null;
  shipLevel?: 1 | 2 | 3;
  /** A knight that killed this turn may attack again (until a non-kill attack). */
  canExtraAttack?: boolean;
  /** Kills scored by this unit during its current turn (knight combos). */
  killsThisTurn?: number;
  /** Player indices that paid this pirate; it will not attack their units. */
  paidBy?: number[];
}

export const UNIT_MOVE_POINTS: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.movePoints,
  rider: UNIT_TYPES.rider.movePoints,
  archer: UNIT_TYPES.archer.movePoints,
  swordsman: UNIT_TYPES.swordsman.movePoints,
  shield: UNIT_TYPES.shield.movePoints,
  catapult: UNIT_TYPES.catapult.movePoints,
  knight: UNIT_TYPES.knight.movePoints,
  pirate: UNIT_TYPES.pirate.movePoints,
};

export const UNIT_ATTACK: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.attack,
  rider: UNIT_TYPES.rider.attack,
  archer: UNIT_TYPES.archer.attack,
  swordsman: UNIT_TYPES.swordsman.attack,
  shield: UNIT_TYPES.shield.attack,
  catapult: UNIT_TYPES.catapult.attack,
  knight: UNIT_TYPES.knight.attack,
  pirate: UNIT_TYPES.pirate.attack,
};

export const UNIT_ATTACK_DISTANCE: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.attackDistance,
  rider: UNIT_TYPES.rider.attackDistance,
  archer: UNIT_TYPES.archer.attackDistance,
  swordsman: UNIT_TYPES.swordsman.attackDistance,
  shield: UNIT_TYPES.shield.attackDistance,
  catapult: UNIT_TYPES.catapult.attackDistance,
  knight: UNIT_TYPES.knight.attackDistance,
  pirate: UNIT_TYPES.pirate.attackDistance,
};

export const MAX_HP = UNIT_TYPES.warrior.maxHp;

/** Money upkeep a land unit of this type costs its home village each turn. */
const UNIT_MAINTENANCE: Record<UnitType, number> = {
  warrior: 1,
  archer: 2,
  swordsman: 3,
  rider: 2,
  knight: 4,
  catapult: 5,
  shield: 2,
  pirate: 0,
};

/** Money upkeep a ship costs its home village each turn, by ship level. */
const SHIP_MAINTENANCE: Record<1 | 2 | 3, number> = {
  1: 2,
  2: 3,
  3: 4,
};

/** Per-turn upkeep of a unit: ship level decides a ship's cost, otherwise the
 *  land unit type. */
export function unitMaintenance(unit: Unit): number {
  if (unit.shipLevel !== undefined) return SHIP_MAINTENANCE[unit.shipLevel];
  return UNIT_MAINTENANCE[unit.type];
}

/** Money cost of disbanding a unit: three rounds of its upkeep. */
export function disbandCost(unit: Unit): number {
  return 3 * unitMaintenance(unit);
}

/** A unit may be disbanded only while it still has its move/attack for the
 *  turn — never after it has already moved or attacked. */
export function canDisband(unit: Unit): boolean {
  return !unit.hasMoved && !unit.hasAttacked;
}

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  warrior: t('unitType.warrior'),
  rider: t('unitType.rider'),
  archer: t('unitType.archer'),
  swordsman: t('unitType.swordsman'),
  shield: t('unitType.shield'),
  catapult: t('unitType.catapult'),
  knight: t('unitType.knight'),
  pirate: t('unitType.pirate'),
};

export const HEAL_AMOUNT = 15;

interface UnitOptions {
  id?: string;
  hasMoved?: boolean;
  hasAttacked?: boolean;
  hasHealed?: boolean;
  hasLanded?: boolean;
  hp?: number;
  spawnVillage?: { q: number; r: number } | null;
  shipLevel?: 1 | 2 | 3;
}

export function makeUnit(
  owner: number,
  type: UnitType,
  q: number,
  r: number,
  opts: UnitOptions = {},
): Unit {
  return {
    id: opts.id ?? `${type}-${q},${r}`,
    owner,
    type,
    q,
    r,
    hasMoved: opts.hasMoved ?? false,
    hasAttacked: opts.hasAttacked ?? false,
    hasHealed: opts.hasHealed ?? false,
    hasLanded: opts.hasLanded,
    hp: opts.hp ?? UNIT_TYPES[type].maxHp,
    attack: UNIT_TYPES[type].attack,
    attackDistance: UNIT_TYPES[type].attackDistance,
    defense: UNIT_TYPES[type].defense,
    spawnVillage: opts.spawnVillage ?? null,
    shipLevel: opts.shipLevel,
  };
}

export function canMove(unit: Unit): boolean {
  if (unit.hasMoved || unit.hasHealed) return false;
  // A ship can never move again in the turn it has attacked.
  if (unit.shipLevel !== undefined) return !unit.hasAttacked;
  return unit.type === 'rider' || !unit.hasAttacked;
}

/** Move points a unit may spend this turn (road bonuses are handled per tile
 *  by the movement-cost model). */
export function movePoints(unit: Unit): number {
  return unit.shipLevel !== undefined ? shipMovePoints(unit) : UNIT_MOVE_POINTS[unit.type];
}

export function canAttack(unit: Unit): boolean {
  if (unit.hasHealed || unit.hasLanded) return false;
  if (unit.hasAttacked) return unit.shipLevel === undefined && unit.type === 'knight' && unit.canExtraAttack === true;
  // A ship may always attack after moving this turn; the shield/catapult
  // "cannot attack after moving" limit applies only to land units.
  if (unit.shipLevel !== undefined) return true;
  return !(unit.type === 'shield' && unit.hasMoved) && !(unit.type === 'catapult' && unit.hasMoved);
}

export function canHeal(unit: Unit): boolean {
  return (
    !unit.hasMoved &&
    !unit.hasAttacked &&
    !unit.hasHealed &&
    unit.hp < UNIT_TYPES[unit.type].maxHp
  );
}

export function healUnit(unit: Unit): void {
  unit.hp = Math.min(UNIT_TYPES[unit.type].maxHp, unit.hp + HEAL_AMOUNT);
  unit.hasHealed = true;
}

/** Whether the pirate has an active deal with the given player: the player
 *  paid it, so it will not attack their units until they attack it back. */
export function hasPirateDeal(unit: Unit, playerIndex: number): boolean {
  return unit.paidBy?.includes(playerIndex) ?? false;
}
