import { describe, it, expect } from 'vitest';
import type { Unit, UnitType } from '../src/game/units';
import { unitHelpLines, unitHelpTitle } from '../src/game/unitDescriptions';

const ALL_TYPES: UnitType[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight', 'pirate'];

function unit(type: UnitType, shipLevel?: 1 | 2 | 3): Unit {
  return {
    id: 'u', owner: 0, type, q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    shipLevel,
  };
}

describe('unit help descriptions', () => {
  it('provides at least one bullet for every unit type', () => {
    for (const type of ALL_TYPES) {
      expect(unitHelpLines(unit(type)).length, type).toBeGreaterThan(0);
    }
  });

  it('describes the pirate special rules', () => {
    const text = unitHelpLines(unit('pirate')).join(' ');
    expect(text).toMatch(/capture/i);
    expect(text).toMatch(/25%/);
    expect(text).toMatch(/steals 25%/i);
    expect(text).toMatch(/30 points/);
  });

  it('describes a ship instead of the crew type when the unit is a ship', () => {
    const lines = unitHelpLines(unit('rider', 2));
    expect(unitHelpTitle(unit('rider', 2))).toBe('Ship (level 2)');
    expect(lines.join(' ')).toMatch(/crew/i);
    expect(lines.join(' ')).toMatch(/never move after attacking/i);
  });
});
