import { describe, it, expect } from 'vitest';
import type { Unit, UnitType } from '../src/game/units';
import { unitHelpLines, unitHelpTitle, unitHelpDescription, unitHelpStats } from '../src/game/unitDescriptions';

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
    const move = rows.find((r) => r.icon === '16/move-16.png');
    expect(move).not.toBeUndefined();
    expect(move!.text).toBe('1 movement');
  });

  it('renders attack, hp, upkeep and defense rows with their values', () => {
    const rows = unitHelpStats(unit('warrior'));
    expect(rows).toEqual([
      { icon: '16/move-16.png', text: '1 movement' },
      { icon: '16/attack-16.png', text: '20 attack' },
      { icon: '16/hp-16.png', text: '50 HP' },
      { icon: '16/gold-16.png', text: '1 upkeep' },
      { icon: '16/def-16.png', text: '0 defense' },
    ]);
  });

  it('uses the current ship level values for a ship at that level', () => {
    const rows = unitHelpStats(unit('rider', 2));
    expect(rows.find((r) => r.icon === '16/move-16.png')!.text).toBe('3 movement');
    expect(rows.find((r) => r.icon === '16/attack-16.png')!.text).toBe('20 attack');
    expect(rows.find((r) => r.icon === '16/gold-16.png')!.text).toBe('3 upkeep');
  });

  it('reports zero upkeep for a pirate', () => {
    const rows = unitHelpStats(unit('pirate'));
    expect(rows.find((r) => r.icon === '16/gold-16.png')!.text).toBe('0 upkeep');
  });
});