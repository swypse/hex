import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import {
  canOpenSkill,
  hasSkill,
  openSkill,
  randomUnopenedSkill,
  skillCost,
  SKILLS,
  SkillId,
} from '../src/game/skills';

function player(money: number, skills: SkillId[] = []): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money, ore: 0 },
    isActive: true,
    score: 0,
    kills: 0,
    skills,
  };
}

describe('skills', () => {
  it('defines the seventeen skills with base costs 3 and 6 and correct parents', () => {
    expect(Object.keys(SKILLS)).toHaveLength(17);
    expect(skillCost('climbing', 0)).toBe(3);
    expect(skillCost('water', 0)).toBe(3);
    expect(skillCost('forestry', 0)).toBe(3);
    expect(skillCost('science', 0)).toBe(3);
    expect(skillCost('shields', 0)).toBe(3);
    expect(skillCost('riding', 0)).toBe(3);
    expect(skillCost('smithery', 0)).toBe(6);
    expect(skillCost('swordsman', 0)).toBe(6);
    expect(skillCost('geology', 0)).toBe(6);
    expect(skillCost('catapult', 0)).toBe(6);
    expect(skillCost('navigation', 0)).toBe(6);
    expect(skillCost('waterTemples', 0)).toBe(6);
    expect(skillCost('forestTemple', 0)).toBe(6);
    expect(skillCost('roads', 0)).toBe(6);
    expect(skillCost('defence', 0)).toBe(6);
    expect(skillCost('knights', 0)).toBe(6);
    expect(skillCost('bridges', 0)).toBe(6);
    expect(SKILLS.smithery.parent).toBe('climbing');
    expect(SKILLS.swordsman.parent).toBe('climbing');
    expect(SKILLS.geology.parent).toBe('science');
    expect(SKILLS.catapult.parent).toBe('science');
    expect(SKILLS.navigation.parent).toBe('water');
    expect(SKILLS.waterTemples.parent).toBe('water');
    expect(SKILLS.forestTemple.parent).toBe('forestry');
    expect(SKILLS.roads.parent).toBe('forestry');
    expect(SKILLS.defence.parent).toBe('shields');
    expect(SKILLS.knights.parent).toBe('riding');
    expect(SKILLS.bridges.parent).toBe('riding');
    expect(SKILLS.climbing.parent).toBeNull();
    expect(SKILLS.water.parent).toBeNull();
    expect(SKILLS.forestry.parent).toBeNull();
    expect(SKILLS.science.parent).toBeNull();
    expect(SKILLS.shields.parent).toBeNull();
    expect(SKILLS.riding.parent).toBeNull();
  });

  it('gates bridges behind riding', () => {
    expect(SKILLS.bridges.level).toBe(2);
    expect(canOpenSkill(player(100), 'bridges')).toBe(false);
    expect(canOpenSkill(player(100, ['riding']), 'bridges')).toBe(true);
    expect(openSkill(player(100, ['riding']), 'bridges')).toBe(true);
  });

  it('scales the cost with the number of already opened skills', () => {
    expect(skillCost('climbing', 0)).toBe(3);
    expect(skillCost('climbing', 1)).toBe(5);
    expect(skillCost('climbing', 2)).toBe(7);
    expect(skillCost('smithery', 0)).toBe(6);
    expect(skillCost('smithery', 3)).toBe(12);
  });

  it('science description mentions the reduced attack miss chance', () => {
    expect(SKILLS.science.description).toContain('5%');
    expect(SKILLS.science.description).toContain('miss');
  });

  it('has a description for every skill', () => {
    for (const s of Object.values(SKILLS)) {
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('canOpenSkill requires the parent and the money', () => {
    expect(canOpenSkill(player(100), 'climbing')).toBe(true);
    expect(canOpenSkill(player(100), 'smithery')).toBe(false);
    expect(canOpenSkill(player(100, ['climbing']), 'smithery')).toBe(true);
    expect(canOpenSkill(player(2), 'climbing')).toBe(false);
  });

  it('openSkill pays money, adds the skill, and rejects repeat/ungated opens', () => {
    const p = player(100);
    expect(openSkill(p, 'climbing')).toBe(true);
    expect(p.skills).toEqual(['climbing']);
    expect(p.resources.money).toBe(97);
    expect(openSkill(p, 'climbing')).toBe(false);
    const q = player(100);
    expect(openSkill(q, 'smithery')).toBe(false);
    expect(q.skills).toEqual([]);
    const broke = player(2);
    expect(openSkill(broke, 'forestry')).toBe(false);
    expect(broke.skills).toEqual([]);
  });

  it('charges the scaled cost for every opened skill', () => {
    const p = player(100, ['climbing', 'science']);
    expect(openSkill(p, 'forestry')).toBe(true);
    expect(p.resources.money).toBe(100 - (3 + 2 * 2));
  });

  it('hasSkill checks the list', () => {
    expect(hasSkill(player(0, ['forestry']), 'forestry')).toBe(true);
    expect(hasSkill(player(0), 'forestry')).toBe(false);
  });

  it('catapult requires the science parent and costs 8 right after science', () => {
    expect(canOpenSkill(player(100), 'catapult')).toBe(false);
    expect(canOpenSkill(player(100, ['science']), 'catapult')).toBe(true);
    expect(skillCost('catapult', 1)).toBe(8);
  });

  it('randomUnopenedSkill returns an unopened skill of any level', () => {
    const p = player(0, ['climbing', 'water', 'forestry', 'science', 'shields']);
    for (let i = 0; i < 50; i++) {
      const id = randomUnopenedSkill(p, Math.random);
      expect(id).not.toBeNull();
      expect(p.skills).not.toContain(id);
    }
    expect(randomUnopenedSkill(p, () => 0)).toBe('smithery');
    expect(randomUnopenedSkill(p, () => 0.9999)).toBeDefined();
  });

  it('randomUnopenedSkill returns null when every skill is open', () => {
    const p = player(0, Object.keys(SKILLS) as SkillId[]);
    expect(randomUnopenedSkill(p, () => 0.5)).toBeNull();
  });
});
