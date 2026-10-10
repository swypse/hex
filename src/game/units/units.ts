import { t } from '../../i18n';
import { shipMovePoints } from './ship';
import type { Resources } from '../economy/resources';
import { Tribe } from '../tribes';
import { UnitType, VeteranBonus } from '@enums';


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
}

export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movePoints: 10, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0 },
  rider: { movePoints: 40, attack: 22, attackDistance: 1, maxHp: 45, defense: 8, price: 6, priceWood: 0, priceOre: 0 },
  archer: { movePoints: 10, attack: 26, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0 },
  swordsman: { movePoints: 10, attack: 40, attackDistance: 1, maxHp: 80, defense: 16, price: 10, priceWood: 0, priceOre: 2 },
  shield: { movePoints: 10, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2 },
  catapult: { movePoints: 10, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3 },
  knight: { movePoints: 30, attack: 40, attackDistance: 1, maxHp: 70, defense: 12, price: 14, priceWood: 0, priceOre: 5 },
  pirate: { movePoints: 50, attack: 15, attackDistance: 3, maxHp: PIRATE_HP, defense: 5, price: 0, priceWood: 0, priceOre: 0 },
  stalker: { movePoints: 20, attack: 10, attackDistance: 1, maxHp: 20, defense: 0, price: 9, priceWood: 0, priceOre: 2 },
  builder: { movePoints: 8, attack: 10, attackDistance: 1, maxHp: 40, defense: 0, price: 15, priceWood: 0, priceOre: 0 },
  banner: { movePoints: 8, attack: 10, attackDistance: 1, maxHp: 30, defense: 0, price: 7, priceWood: 0, priceOre: 2 },
  berserker: { movePoints: 10, attack: 26, attackDistance: 1, maxHp: 50, defense: 8, price: 10, priceWood: 0, priceOre: 2 },
  trapper: { movePoints: 10, attack: 20, attackDistance: 1, maxHp: 44, defense: 8, price: 6, priceWood: 0, priceOre: 2 },
  stormcaller: { movePoints: 20, attack: 20, attackDistance: 1, maxHp: 44, defense: 8, price: 6, priceWood: 0, priceOre: 2 },
  stunner: { movePoints: 8, attack: 20, attackDistance: 2, maxHp: 40, defense: 10, price: 7, priceWood: 0, priceOre: 2 },
};

/** Resources needed to spawn a unit of this type. */
export function unitSpawnCost(type: UnitType): Resources {
  const info = UNIT_TYPES[type];
  return { wood: info.priceWood, stone: 0, money: info.price, ore: info.priceOre, food: 0 };
}

export const UNIT_IMAGE_FILES: Record<Tribe, Record<PlayableUnitType, string>> = {
  [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png', shield: 'cats-shield.png', catapult: 'cats-catapult.png', knight: 'cats-knight.png', stalker: 'cats-stalker.png', builder: 'cats-warrior.png', banner: 'cats-warrior.png', berserker: 'cats-warrior.png', trapper: 'cats-warrior.png', stormcaller: 'cats-warrior.png', stunner: 'cats-warrior.png' },
  [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png', shield: 'warriors-shield.png', catapult: 'warriors-catapult.png', knight: 'warriors-knight.png', stalker: 'warriors-warrior.png', builder: 'warriors-warrior.png', banner: 'warriors-banner-bearer.png', berserker: 'warriors-warrior.png', trapper: 'warriors-warrior.png', stormcaller: 'warriors-warrior.png', stunner: 'warriors-warrior.png' },
  [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png', shield: 'villagers-shield.png', catapult: 'villagers-catapult.png', knight: 'villagers-knight.png', stalker: 'villagers-warrior.png', builder: 'villagers-builder.png', banner: 'villagers-warrior.png', berserker: 'villagers-warrior.png', trapper: 'villagers-warrior.png', stormcaller: 'villagers-warrior.png', stunner: 'villagers-warrior.png' },
  [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png', shield: 'barbarians-shield.png', catapult: 'barbarians-catapult.png', knight: 'barbarians-knight.png', stalker: 'barbarians-warrior.png', builder: 'barbarians-warrior.png', banner: 'barbarians-warrior.png', berserker: 'barbarians-berserker.png', trapper: 'barbarians-warrior.png', stormcaller: 'barbarians-warrior.png', stunner: 'barbarians-warrior.png' },
  [Tribe.Forest]: { warrior: 'forest-warrior.png', rider: 'forest-rider.png', archer: 'forest-archer.png', swordsman: 'forest-swordsman.png', shield: 'forest-shield.png', catapult: 'forest-catapult.png', knight: 'forest-knight.png', stalker: 'forest-warrior.png', builder: 'forest-warrior.png', banner: 'forest-warrior.png', berserker: 'forest-warrior.png', trapper: 'forest-trapper.png', stormcaller: 'forest-warrior.png', stunner: 'forest-warrior.png' },
  [Tribe.Aqua]: { warrior: 'aqua-warrior.png', rider: 'aqua-rider.png', archer: 'aqua-archer.png', swordsman: 'aqua-swordsman.png', shield: 'aqua-shield.png', catapult: 'aqua-catapult.png', knight: 'aqua-knight.png', stalker: 'aqua-warrior.png', builder: 'aqua-warrior.png', banner: 'aqua-warrior.png', berserker: 'aqua-warrior.png', trapper: 'aqua-warrior.png', stormcaller: 'aqua-stormcaller.png', stunner: 'aqua-warrior.png' },
  [Tribe.Sand]: { warrior: 'sand-warrior.png', rider: 'sand-rider.png', archer: 'sand-archer.png', swordsman: 'sand-swordsman.png', shield: 'sand-shield.png', catapult: 'sand-catapult.png', knight: 'sand-knight.png', stalker: 'sand-warrior.png', builder: 'sand-warrior.png', banner: 'sand-warrior.png', berserker: 'sand-warrior.png', trapper: 'sand-warrior.png', stormcaller: 'sand-warrior.png', stunner: 'sand-stunner.png' },
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
  /** Stalker: hidden from everyone but the owner while true. */
  isStealthed?: boolean;
  /** Stalker: set once the spawn first-move auto-stealth was consumed. */
  firstMoveStealthDone?: boolean;
  /** Turns the unit is stunned; >= 1 means it cannot act. */
  stunTurns?: number;
  /** Set while the unit gets less food than it eats (it takes starvation damage). */
  starving?: boolean;
  /** Pirate: the player (tribe) it is currently hunting. */
  pirateTarget?: number;
  /** Pirate: attacks made on the current target tribe. */
  pirateAttacks?: number;
  /** Pirate: the last tribes it hunted (at most two, newest last); a new target is never taken from it. */
  pirateTribes?: number[];
  /** Pirate: it was attacked by this tribe and hunts it for `turns` more pirate turns. */
  pirateRevenge?: { target: number; turns: number };
  /** Kills scored by this unit over the game (counts up to `VETERAN_KILLS`). */
  kills?: number;
  /** Set on the unit's `VETERAN_KILLS`th kill. */
  veteran?: boolean;
  /** The veteran's chosen bonus; unset while a veteran is still waiting for its owner to pick. */
  veteranBonus?: VeteranBonus;
}

/** Kills that make a unit a veteran. */
export const VETERAN_KILLS = 3;
export const VETERAN_ATTACK_BONUS = 5;
export const VETERAN_HP_BONUS = 10;
export const VETERAN_MOVE_BONUS = 20;

/** The unit's max hp: its type's, plus a veteran's hp bonus. */
export function unitMaxHp(unit: Pick<Unit, 'type' | 'veteranBonus'>): number {
  return UNIT_TYPES[unit.type].maxHp + (unit.veteranBonus === VeteranBonus.HP ? VETERAN_HP_BONUS : 0);
}

/** A veteran's flat attack bonus (0 for anyone else). */
export function veteranAttackBonus(unit: Pick<Unit, 'veteranBonus'>): number {
  return unit.veteranBonus === VeteranBonus.ATTACK ? VETERAN_ATTACK_BONUS : 0;
}

/** Records a kill for a unit. Returns true when it just became a veteran: it is
 *  fully healed at once and its owner must pick a bonus. Pirates never promote. */
export function recordKill(unit: Unit): boolean {
  if (unit.owner < 0) return false;
  unit.kills = (unit.kills ?? 0) + 1;
  if (unit.veteran || unit.kills < VETERAN_KILLS) return false;
  unit.veteran = true;
  unit.hp = unitMaxHp(unit);
  return true;
}

/** The bonus an AI-controlled veteran takes: tough and support units more hp,
 *  riders more reach, everything else more attack. */
export function aiVeteranBonus(unit: Pick<Unit, 'type'>): VeteranBonus {
  switch (unit.type) {
    case UnitType.SHIELD:
    case UnitType.BANNER:
    case UnitType.BUILDER:
    case UnitType.STALKER:
      return VeteranBonus.HP;
    case UnitType.RIDER:
      return VeteranBonus.MOVE;
    default:
      return VeteranBonus.ATTACK;
  }
}

/** Whether the unit is a veteran that has not picked its bonus yet. */
export function needsVeteranBonus(unit: Unit): boolean {
  return unit.veteran === true && unit.veteranBonus === undefined;
}

/** Gives a pending veteran its bonus; an hp bonus also refills it to the new maximum. */
export function applyVeteranBonus(unit: Unit, bonus: VeteranBonus): boolean {
  if (!needsVeteranBonus(unit)) return false;
  unit.veteranBonus = bonus;
  unit.hp = unitMaxHp(unit);
  return true;
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
  stalker: UNIT_TYPES.stalker.movePoints,
  builder: UNIT_TYPES.builder.movePoints,
  banner: UNIT_TYPES.banner.movePoints,
  berserker: UNIT_TYPES.berserker.movePoints,
  trapper: UNIT_TYPES.trapper.movePoints,
  stormcaller: UNIT_TYPES.stormcaller.movePoints,
  stunner: UNIT_TYPES.stunner.movePoints,
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
  stalker: UNIT_TYPES.stalker.attack,
  builder: UNIT_TYPES.builder.attack,
  banner: UNIT_TYPES.banner.attack,
  berserker: UNIT_TYPES.berserker.attack,
  trapper: UNIT_TYPES.trapper.attack,
  stormcaller: UNIT_TYPES.stormcaller.attack,
  stunner: UNIT_TYPES.stunner.attack,
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
  stalker: UNIT_TYPES.stalker.attackDistance,
  builder: UNIT_TYPES.builder.attackDistance,
  banner: UNIT_TYPES.banner.attackDistance,
  berserker: UNIT_TYPES.berserker.attackDistance,
  trapper: UNIT_TYPES.trapper.attackDistance,
  stormcaller: UNIT_TYPES.stormcaller.attackDistance,
  stunner: UNIT_TYPES.stunner.attackDistance,
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
  stalker: 3,
  builder: 2,
  banner: 3,
  berserker: 4,
  trapper: 3,
  stormcaller: 4,
  stunner: 2,
};

/** Food a land unit of this type eats per turn from the village that raised it. */
const UNIT_FOOD_UPKEEP: Record<UnitType, number> = {
  warrior: 1,
  archer: 1,
  rider: 1,
  swordsman: 3,
  knight: 3,
  catapult: 3,
  shield: 2,
  pirate: 0,
  stalker: 3,
  builder: 3,
  banner: 3,
  berserker: 3,
  trapper: 3,
  stormcaller: 3,
  stunner: 3,
};

/** Per-turn food upkeep of a unit type. */
export function unitFoodUpkeep(type: UnitType): number {
  return UNIT_FOOD_UPKEEP[type];
}

/** Food a concrete unit eats per round: nothing when it has no home village. */
export function unitFoodEaten(unit: Pick<Unit, 'type' | 'spawnVillage'>): number {
  return unit.spawnVillage ? UNIT_FOOD_UPKEEP[unit.type] : 0;
}

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

/** Upkeep of a land unit type (balance analysis; ignores ship levels). */
export function unitTypeMaintenance(type: UnitType): number {
  return UNIT_MAINTENANCE[type];
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
  stalker: t('unitType.stalker'),
  builder: t('unitType.builder'),
  banner: t('unitType.banner'),
  berserker: t('unitType.berserker'),
  trapper: t('unitType.trapper'),
  stormcaller: t('unitType.stormcaller'),
  stunner: t('unitType.stunner'),
};

export const HEAL_AMOUNT = 15;
/** Extra hp a unit heals on a tile of a village with a university once its owner has Medicine. */
export const MEDICINE_HEAL_BONUS = 10;

interface UnitOptions {
  id?: string;
  hasMoved?: boolean;
  hasAttacked?: boolean;
  hasHealed?: boolean;
  hasLanded?: boolean;
  hp?: number;
  spawnVillage?: { q: number; r: number } | null;
  shipLevel?: 1 | 2 | 3;
  isStealthed?: boolean;
  firstMoveStealthDone?: boolean;
  stunTurns?: number;
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
    isStealthed: opts.isStealthed,
    firstMoveStealthDone: opts.firstMoveStealthDone,
    stunTurns: opts.stunTurns,
  };
}

export function canMove(unit: Unit): boolean {
  if (isStunnedLocal(unit)) return false;
  if (unit.hasMoved || unit.hasHealed) return false;
  // A ship can never move again in the turn it has attacked.
  if (unit.shipLevel !== undefined) return !unit.hasAttacked;
  return unit.type === UnitType.RIDER || !unit.hasAttacked;
}

/** Move points a unit may spend this turn (road bonuses are handled per tile
 *  by the movement-cost model). */
export function movePoints(unit: Unit): number {
  if (unit.shipLevel !== undefined) return shipMovePoints(unit);
  return UNIT_MOVE_POINTS[unit.type] + (unit.veteranBonus === VeteranBonus.MOVE ? VETERAN_MOVE_BONUS : 0);
}

export function canAttack(unit: Unit): boolean {
  if (isStunnedLocal(unit)) return false;
  if (unit.hasHealed || unit.hasLanded) return false;
  if (unit.hasAttacked) return unit.shipLevel === undefined && unit.type === UnitType.KNIGHT && unit.canExtraAttack === true;
  // A ship may always attack after moving this turn; the shield/catapult
  // "cannot attack after moving" limit applies only to land units.
  if (unit.shipLevel !== undefined) return true;
  return !(unit.type === UnitType.SHIELD && unit.hasMoved) && !(unit.type === UnitType.CATAPULT && unit.hasMoved);
}

export function canHeal(unit: Unit): boolean {
  return (
    !isStunnedLocal(unit) &&
    !unit.hasMoved &&
    !unit.hasAttacked &&
    !unit.hasHealed &&
    unit.hp < unitMaxHp(unit)
  );
}

function isStunnedLocal(unit: Unit): boolean {
  return (unit.stunTurns ?? 0) >= 1;
}

/** Heals the unit by `amount` (a heal action or the end-of-turn auto heal). */
export function healUnit(unit: Unit, amount: number = HEAL_AMOUNT): void {
  unit.hp = Math.min(unitMaxHp(unit), unit.hp + amount);
  unit.hasHealed = true;
}

/** Whether the pirate has an active deal with the given player: the player
 *  paid it, so it will not attack their units until they attack it back. */
export function hasPirateDeal(unit: Unit, playerIndex: number): boolean {
  return unit.paidBy?.includes(playerIndex) ?? false;
}

/** Whether the player may deal with this pirate: it must be on water the player owns. */
export function canDealWithPirate(tile: { unit: Unit | null; ownedBy: number | null }, playerIndex: number): boolean {
  return tile.unit?.type === UnitType.PIRATE && tile.ownedBy === playerIndex;
}
