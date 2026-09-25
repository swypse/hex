import { describe, it, expect } from 'vitest';
import type { Unit, UnitType } from '../src/game/units';
import { unitHelpLines, unitHelpTitle, unitHelpDescription, unitHelpStats } from '../src/game/unit-descriptions';

const ALL_TYPES: UnitType[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight', 'pirate', 'stalker', 'builder', 'banner', 'berserker', 'trapper', 'stormcaller', 'stunner'];

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

describe('unit help description line', () => {
  it('provides a non-empty description for every unit type', () => {
    for (const type of ALL_TYPES) {
      expect(unitHelpDescription(unit(type)).length, type).toBeGreaterThan(0);
    }
  });

  it('describes the crew when the unit is a ship', () => {
    const desc = unitHelpDescription(unit('rider', 2));
    expect(desc).toMatch(/rider/i);
  });
});

describe('unit help stat rows', () => {
  it('renders a movement icon row with the movement value', () => {
    const rows = unitHelpStats(unit('warrior'));
    const move = rows.find((r) => r.icon === 'move-32');
    expect(move).not.toBeUndefined();
    expect(move!.text).toBe('10 move points');
  });

  it('renders attack, hp, upkeep and defense rows with their values', () => {
    const rows = unitHelpStats(unit('warrior'));
    expect(rows).toEqual([
      { icon: 'move-32', text: '10 move points' },
      { icon: 'attack-32', text: '20 attack' },
      { icon: 'hp-32', text: '50 HP' },
      { icon: 'gold-32', text: '1 upkeep' },
      { icon: 'def-32', text: '0 defense' },
    ]);
  });

  it('uses the current ship level values for a ship at that level', () => {
    const rows = unitHelpStats(unit('rider', 2));
    expect(rows.find((r) => r.icon === 'move-32')!.text).toBe('30 move points');
    expect(rows.find((r) => r.icon === 'attack-32')!.text).toBe('20 attack');
    expect(rows.find((r) => r.icon === 'gold-32')!.text).toBe('3 upkeep');
  });

  it('reports zero upkeep for a pirate', () => {
    const rows = unitHelpStats(unit('pirate'));
    expect(rows.find((r) => r.icon === 'gold-32')!.text).toBe('0 upkeep');
  });
});