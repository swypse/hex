import { describe, it, expect } from 'vitest';
import type { Unit } from '../src/game/units';
import { unitHelpLines, unitHelpTitle, unitHelpDescription, unitHelpStats } from '../src/game/unit-descriptions';
import { UnitType } from '@enums';

const ALL_TYPES: UnitType[] = [UnitType.WARRIOR, UnitType.RIDER, UnitType.ARCHER, UnitType.SWORDSMAN, UnitType.SHIELD, UnitType.CATAPULT, UnitType.KNIGHT, UnitType.PIRATE, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STORMCALLER, UnitType.STUNNER];

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
    const text = unitHelpLines(unit(UnitType.PIRATE)).join(' ');
    expect(text).toMatch(/capture/i);
    expect(text).toMatch(/25%/);
    expect(text).toMatch(/steals 25%/i);
    expect(text).toMatch(/30 points/);
  });

  it('describes a ship instead of the crew type when the unit is a ship', () => {
    const lines = unitHelpLines(unit(UnitType.RIDER, 2));
    expect(unitHelpTitle(unit(UnitType.RIDER, 2))).toBe('Ship (level 2)');
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
    const desc = unitHelpDescription(unit(UnitType.RIDER, 2));
    expect(desc).toMatch(/rider/i);
  });
});

describe('unit help stat rows', () => {
  it('renders a movement icon row with the movement value', () => {
    const rows = unitHelpStats(unit(UnitType.WARRIOR));
    const move = rows.find((r) => r.icon === 'move-32');
    expect(move).not.toBeUndefined();
    expect(move!.text).toBe('10 move points');
  });

  it('renders attack, hp, upkeep and defense rows with their values', () => {
    const rows = unitHelpStats(unit(UnitType.WARRIOR));
    expect(rows).toEqual([
      { icon: 'move-32', text: '10 move points' },
      { icon: 'attack-32', text: '20 attack' },
      { icon: 'hp-32', text: '50 HP' },
      { icon: 'gold-32', text: '1 upkeep' },
      { icon: 'def-32', text: '0 defense' },
    ]);
  });

  it('uses the current ship level values for a ship at that level', () => {
    const rows = unitHelpStats(unit(UnitType.RIDER, 2));
    expect(rows.find((r) => r.icon === 'move-32')!.text).toBe('30 move points');
    expect(rows.find((r) => r.icon === 'attack-32')!.text).toBe('20 attack');
    expect(rows.find((r) => r.icon === 'gold-32')!.text).toBe('3 upkeep');
  });

  it('adds a food row only for units raised by a village', () => {
    const u = unit(UnitType.SWORDSMAN);
    expect(unitHelpStats(u).some((r) => r.icon === 'food-32')).toBe(false);
    u.spawnVillage = { q: 0, r: 0 };
    const rows = unitHelpStats(u);
    expect(rows[rows.length - 1]).toEqual({ icon: 'food-32', text: 'Eats 3 food per round' });
  });

  it('reports zero upkeep for a pirate', () => {
    const rows = unitHelpStats(unit(UnitType.PIRATE));
    expect(rows.find((r) => r.icon === 'gold-32')!.text).toBe('0 upkeep');
  });
});