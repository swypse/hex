import { UNIT_TYPE_NAMES, UNIT_TYPES, Unit, UnitType, unitMaintenance } from './units';
import { SHIP_ATTACK, SHIP_ATTACK_DISTANCE, SHIP_MOVEMENT, SHIP_UPGRADE_COST, shipMovement } from './ship';
import { t } from '../i18n';

/** i18n keys for the short feature bullets shown for each land unit. */
const LAND_KEYS: Record<UnitType, string[]> = {
  warrior: ['help.warrior.melee', 'help.warrior.advance'],
  rider: ['help.rider.base', 'help.rider.postMove', 'help.rider.advance', 'help.rider.skill'],
  archer: ['help.archer.base', 'help.archer.noAdvance'],
  swordsman: ['help.swordsman.base', 'help.swordsman.skill', 'help.warrior.advance'],
  shield: ['help.shield.base', 'help.shield.counter', 'help.shield.moveLock', 'help.shield.skill'],
  catapult: ['help.catapult.base', 'help.catapult.damage', 'help.shield.moveLock', 'help.catapult.noAdvance', 'help.catapult.skill'],
  knight: ['help.knight.base', 'help.knight.rekill', 'help.knight.combo', 'help.warrior.advance', 'help.knight.skill'],
  pirate: ['help.pirate.base', 'help.pirate.spawn', 'help.pirate.act', 'help.pirate.capture', 'help.pirate.steal', 'help.pirate.reward'],
};

/** i18n key for the one-line unit description shown atop the info popup. */
const DESC_KEYS: Record<UnitType, string> = {
  warrior: 'help.warrior.desc',
  rider: 'help.rider.desc',
  archer: 'help.archer.desc',
  swordsman: 'help.swordsman.desc',
  shield: 'help.shield.desc',
  catapult: 'help.catapult.desc',
  knight: 'help.knight.desc',
  pirate: 'help.pirate.desc',
};

export function unitHelpTitle(unit: Unit): string {
  if (unit.shipLevel !== undefined) return t('help.ship.title', { level: unit.shipLevel });
  return UNIT_TYPE_NAMES[unit.type];
}

/** One-line flavour description shown as the popup's first line. */
export function unitHelpDescription(unit: Unit): string {
  if (unit.shipLevel !== undefined) return t('help.ship.desc', { crew: UNIT_TYPE_NAMES[unit.type] });
  return t(DESC_KEYS[unit.type]);
}

export interface UnitHelpStat {
  /** 16px icon file, e.g. '16/move-16.png'. */
  icon: string;
  /** Localized stat text, e.g. '1 movement'. */
  text: string;
}

/** The five stat rows shown in the unit info popup, using current ship-level
 *  values when the unit is a ship (movement/attack/upkeep by level). */
export function unitHelpStats(unit: Unit): UnitHelpStat[] {
  const movement = unit.shipLevel !== undefined ? shipMovement(unit) : UNIT_TYPES[unit.type].movement;
  const attack = unit.shipLevel !== undefined ? SHIP_ATTACK[unit.shipLevel] : UNIT_TYPES[unit.type].attack;
  const hp = UNIT_TYPES[unit.type].maxHp;
  const upkeep = unitMaintenance(unit);
  const defense = unit.defense ?? 0;
  return [
    { icon: '16/move-16.png', text: t('help.stat.movement', { n: movement }) },
    { icon: '16/attack-16.png', text: t('help.stat.attack', { n: attack }) },
    { icon: '16/hp-16.png', text: t('help.stat.hp', { n: hp }) },
    { icon: '16/gold-16.png', text: t('help.stat.upkeep', { n: upkeep }) },
    { icon: '16/def-16.png', text: t('help.stat.defense', { n: defense }) },
  ];
}

export function unitHelpLines(unit: Unit): string[] {
  if (unit.shipLevel === undefined) return LAND_KEYS[unit.type].map((key) => t(key));
  const crew = UNIT_TYPE_NAMES[unit.type];
  return [
    t('help.ship.crew', { crew }),
    t('help.ship.stats', {
      m1: SHIP_MOVEMENT[1], m2: SHIP_MOVEMENT[2], m3: SHIP_MOVEMENT[3],
      a1: SHIP_ATTACK[1], a2: SHIP_ATTACK[2], a3: SHIP_ATTACK[3],
      d1: SHIP_ATTACK_DISTANCE[1], d2: SHIP_ATTACK_DISTANCE[2], d3: SHIP_ATTACK_DISTANCE[3],
    }),
    t('help.ship.created'),
    t('help.ship.attack'),
    t('help.ship.upgrade', {
      m2: SHIP_UPGRADE_COST[2].money, w2: SHIP_UPGRADE_COST[2].wood,
      m3: SHIP_UPGRADE_COST[3].money, w3: SHIP_UPGRADE_COST[3].wood, o3: SHIP_UPGRADE_COST[3].ore,
    }),
    t('help.ship.land'),
  ];
}
