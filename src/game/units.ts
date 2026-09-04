import { shipMovement } from './ship';
import { hexNeighbors } from './hex';
import { Tribe } from './tribes';
import type { GameMap, MapTile } from './mapGen';

export type UnitType = 'warrior' | 'rider' | 'archer' | 'swordsman' | 'shield' | 'catapult' | 'knight' | 'pirate';
export type PlayableUnitType = Exclude<UnitType, 'pirate'>;

export const PIRATE_OWNER = -1;
export const PIRATE_HP = 150;
export const PIRATE_COLOR = 0x111111;

export interface UnitTypeInfo {
  movement: number;
  attack: number;
  attackDistance: number;
  maxHp: number;
  defence: number;
  price: number;
  priceWood: number;
  priceOre: number;
  shape: 'circle' | 'square' | 'triangle' | 'swordsman';
}

export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movement: 1, attack: 20, attackDistance: 1, maxHp: 50, defence: 0, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' },
  rider: { movement: 4, attack: 20, attackDistance: 1, maxHp: 40, defence: 5, price: 6, priceWood: 0, priceOre: 0, shape: 'square' },
  archer: { movement: 1, attack: 20, attackDistance: 2, maxHp: 30, defence: 5, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' },
  swordsman: { movement: 1, attack: 40, attackDistance: 1, maxHp: 80, defence: 10, price: 15, priceWood: 0, priceOre: 3, shape: 'swordsman' },
  shield: { movement: 1, attack: 10, attackDistance: 1, maxHp: 100, defence: 20, price: 10, priceWood: 0, priceOre: 3, shape: 'square' },
  catapult: { movement: 1, attack: 40, attackDistance: 4, maxHp: 30, defence: 0, price: 30, priceWood: 20, priceOre: 5, shape: 'square' },
  knight: { movement: 3, attack: 50, attackDistance: 1, maxHp: 50, defence: 10, price: 20, priceWood: 0, priceOre: 10, shape: 'swordsman' },
  pirate: { movement: 5, attack: 30, attackDistance: 3, maxHp: PIRATE_HP, defence: 10, price: 0, priceWood: 0, priceOre: 0, shape: 'square' },
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
  defence?: number;
  spawnVillage: { q: number; r: number } | null;
  shipLevel?: 1 | 2 | 3;
  /** A knight that killed this turn may attack again (until a non-kill attack). */
  canExtraAttack?: boolean;
  /** Kills scored by this unit during its current turn (knight combos). */
  killsThisTurn?: number;
}

export const UNIT_MOVEMENT: Record<UnitType, number> = {
  warrior: UNIT_TYPES.warrior.movement,
  rider: UNIT_TYPES.rider.movement,
  archer: UNIT_TYPES.archer.movement,
  swordsman: UNIT_TYPES.swordsman.movement,
  shield: UNIT_TYPES.shield.movement,
  catapult: UNIT_TYPES.catapult.movement,
  knight: UNIT_TYPES.knight.movement,
  pirate: UNIT_TYPES.pirate.movement,
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

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  warrior: 'Warrior',
  rider: 'Rider',
  archer: 'Archer',
  swordsman: 'Swordsman',
  shield: 'Shield',
  catapult: 'Catapult',
  knight: 'Knight',
  pirate: 'Pirate',
};

export const HEAL_AMOUNT = 20;

export interface UnitOptions {
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
    defence: UNIT_TYPES[type].defence,
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

export function moveRange(unit: Unit, tile?: MapTile, map?: GameMap): number {
  const base = unit.shipLevel !== undefined ? shipMovement(unit) : UNIT_MOVEMENT[unit.type];
  if (tile?.roadOwner === unit.owner) return base + 1;
  if (map && tile?.settlement && tile.settlement.owner === unit.owner) {
    const connected = hexNeighbors(tile).some((n) => {
      const t = map.tiles.find((x) => x.q === n.q && x.r === n.r);
      return t !== undefined && t.roadOwner === unit.owner;
    });
    if (connected) return base + 1;
  }
  return base;
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
