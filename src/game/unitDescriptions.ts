import { UNIT_TYPE_NAMES, Unit, UnitType } from './units';
import { SHIP_ATTACK, SHIP_ATTACK_DISTANCE, SHIP_MOVEMENT, SHIP_UPGRADE_COST } from './ship';

/** Short feature bullets shown for a land unit in the unit info popup. */
const LAND_LINES: Record<UnitType, string[]> = {
  warrior: [
    'Basic melee unit: 1 movement, 20 attack, 50 HP.',
    'Moves onto the tile of a unit it kills in melee.',
  ],
  rider: [
    'Fast mounted unit: 4 movement, 20 attack, 40 HP.',
    'After attacking it can move again the same turn.',
    'Moves onto the tile of a unit it kills in melee.',
    'Requires the Riding skill (6 money).',
  ],
  archer: [
    'Ranged unit: 1 movement, 20 attack at range 2, 30 HP.',
    'Does not move onto the tile of a unit it kills.',
  ],
  swordsman: [
    'Heavy melee unit: 1 movement, 40 attack, 80 HP.',
    'Requires the Swordsman skill (15 money + 3 ore).',
    'Moves onto the tile of a unit it kills in melee.',
  ],
  shield: [
    'Defender: 1 movement, 10 attack, 100 HP.',
    'Counter-attacks with 50-based damage.',
    'Cannot attack in a turn in which it has already moved (on land).',
    'Requires the Shields skill (10 money + 3 ore).',
  ],
  catapult: [
    'Siege unit: 1 movement, attack range 4, 30 HP.',
    'Deals 40–60 random damage per attack.',
    'Cannot attack in a turn in which it has already moved (on land).',
    'Never moves onto the tile of a unit it kills.',
    'Requires the Catapult skill (30 money + 20 wood + 5 ore).',
  ],
  knight: [
    'Elite cavalry: 3 movement, 50 attack, 50 HP.',
    'After killing an enemy it may attack again in the same turn.',
    '3 kills in a single turn triggers a Combo kill bonus of 30 points.',
    'Moves onto the tile of a unit it kills in melee.',
    'Requires the Knights skill (20 money + 10 ore).',
  ],
  pirate: [
    'Neutral sea raider: 5 movement on water, 30 attack, 150 HP.',
    'From turn 7 a pirate may appear on an edge water cell every odd turn.',
    'After all players act, it attacks the nearest player unit or moves toward it.',
    'Next to a ship it tries to capture it (25% chance): on success the ship becomes a pirate ship; on failure it loses 20 HP and the ship loses 10 HP.',
    'Sinking a player ship steals 25% of that player money.',
    'Killing a pirate awards 30 points.',
  ],
};

const SHIP_STAT_LINE = `Ship movement is ${SHIP_MOVEMENT[1]}/${SHIP_MOVEMENT[2]}/${SHIP_MOVEMENT[3]}, attack ${SHIP_ATTACK[1]}/${SHIP_ATTACK[2]}/${SHIP_ATTACK[3]} at range ${SHIP_ATTACK_DISTANCE[1]}/${SHIP_ATTACK_DISTANCE[2]}/${SHIP_ATTACK_DISTANCE[3]} for levels 1/2/3.`;
const SHIP_UPGRADE_LINE = `Upgrade to level 2 costs ${SHIP_UPGRADE_COST[2].money} money + ${SHIP_UPGRADE_COST[2].wood} wood; to level 3: ${SHIP_UPGRADE_COST[3].money} money + ${SHIP_UPGRADE_COST[3].wood} wood + ${SHIP_UPGRADE_COST[3].ore} ore (on an owned cell).`;

export function unitHelpTitle(unit: Unit): string {
  if (unit.shipLevel !== undefined) return `Ship (level ${unit.shipLevel})`;
  return UNIT_TYPE_NAMES[unit.type];
}

export function unitHelpLines(unit: Unit): string[] {
  if (unit.shipLevel === undefined) return LAND_LINES[unit.type];
  const crew = UNIT_TYPE_NAMES[unit.type];
  return [
    `Carries a ${crew} unit as its crew.`,
    SHIP_STAT_LINE,
    'Created by moving a unit onto its own port; boarding ends the turn.',
    'May attack in the same turn it has moved, but can never move after attacking.',
    SHIP_UPGRADE_LINE,
    'May land only on coast tiles; landing turns it back into the land unit and consumes the whole turn.',
  ];
}
