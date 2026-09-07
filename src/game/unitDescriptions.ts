import { UNIT_TYPE_NAMES, Unit, UnitType } from './units';
import { SHIP_ATTACK, SHIP_ATTACK_DISTANCE, SHIP_MOVEMENT, SHIP_UPGRADE_COST } from './ship';
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

export function unitHelpTitle(unit: Unit): string {
  if (unit.shipLevel !== undefined) return t('help.ship.title', { level: unit.shipLevel });
  return UNIT_TYPE_NAMES[unit.type];
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
