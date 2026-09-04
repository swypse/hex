import { describe, it, expect } from 'vitest';
import { TRIBES, Tribe } from '../src/game/tribes';

describe('TRIBES', () => {
  it('keeps existing enum ids stable and adds forest/aqua last', () => {
    expect(Tribe.Cats).toBe(3);
    expect(Tribe.Forest).toBe(4);
    expect(Tribe.Aqua).toBe(5);
  });

  it('defines six tribes with unique ids', () => {
    expect(TRIBES).toHaveLength(6);
    expect(new Set(TRIBES.map((t) => t.id)).size).toBe(6);
  });

  it('assigns codes in order', () => {
    expect(TRIBES.map((t) => t.code)).toEqual(['cats', 'villagers', 'warriors', 'barbarians', 'forest', 'aqua']);
  });

  it('names and colors the new tribes', () => {
    const forest = TRIBES.find((t) => t.code === 'forest')!;
    const aqua = TRIBES.find((t) => t.code === 'aqua')!;
    expect(forest.name).toBe('Forest people');
    expect(forest.color).toBe(0x47b220);
    expect(aqua.name).toBe('Aqua people');
    expect(aqua.color).toBe(0x4da2da);
  });

  it('declares the tribe starting bonuses', () => {
    const byCode = new Map(TRIBES.map((t) => [t.code, t]));
    expect(byCode.get('villagers')!.startMoneyBonus).toBe(10);
    expect(byCode.get('barbarians')!.startSkill).toBe('climbing');
    expect(byCode.get('cats')!.startSkill).toBe('shields');
    expect(byCode.get('warriors')!.startSkill).toBe('swordsman');
    expect(byCode.get('forest')!.startSkill).toBe('forestry');
    expect(byCode.get('aqua')!.startSkill).toBe('navigation');
  });
});
