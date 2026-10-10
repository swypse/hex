import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';
import { canOpenSkill, hasSkill, openSkill, randomUnopenedSkill, skillCost, SKILLS } from '../src/game/skills';
import { SkillId } from '@enums';

function player(money: number, skills: SkillId[] = []): Player {
  return {
    index: 0,
    tribe: Tribe.Villagers,
    isHuman: true,
    name: 'p',
    resources: { wood: 0, stone: 0, money, ore: 0, food: 20 },
    isActive: true,
    score: 0,
    kills: 0,
    skills,
  };
}

describe('skills', () => {
  it('defines the twenty-two skills with base costs 3 and 6 and correct parents', () => {
    expect(Object.keys(SKILLS)).toHaveLength(22);
    expect(skillCost(SkillId.CLIMBING, 0)).toBe(3);
    expect(skillCost(SkillId.WATER, 0)).toBe(3);
    expect(skillCost(SkillId.FORESTRY, 0)).toBe(3);
    expect(skillCost(SkillId.SCIENCE, 0)).toBe(3);
    expect(skillCost(SkillId.SHIELDS, 0)).toBe(3);
    expect(skillCost(SkillId.RIDING, 0)).toBe(3);
    expect(skillCost(SkillId.SMITHERY, 0)).toBe(6);
    expect(skillCost(SkillId.SWORDSMAN, 0)).toBe(6);
    expect(skillCost(SkillId.GEOLOGY, 0)).toBe(6);
    expect(skillCost(SkillId.CATAPULT, 0)).toBe(6);
    expect(skillCost(SkillId.NAVIGATION, 0)).toBe(6);
    expect(skillCost(SkillId.WATER_TEMPLES, 0)).toBe(6);
    expect(skillCost(SkillId.FOREST_TEMPLE, 0)).toBe(6);
    expect(skillCost(SkillId.ROADS, 0)).toBe(6);
    expect(skillCost(SkillId.DEFENSE, 0)).toBe(6);
    expect(skillCost(SkillId.KNIGHTS, 0)).toBe(6);
    expect(skillCost(SkillId.BRIDGES, 0)).toBe(6);
    expect(SKILLS.smithery.parent).toBe(SkillId.CLIMBING);
    expect(SKILLS.swordsman.parent).toBe(SkillId.CLIMBING);
    expect(SKILLS.geology.parent).toBe(SkillId.SCIENCE);
    expect(SKILLS.catapult.parent).toBe(SkillId.SHIELDS);
    expect(SKILLS.agronomy.parent).toBe(SkillId.AGRICULTURE);
    expect(SKILLS.engineering.parent).toBe(SkillId.SCIENCE);
    expect(SKILLS.medicine.parent).toBe(SkillId.SCIENCE);
    expect(SKILLS.navigation.parent).toBe(SkillId.WATER);
    expect(SKILLS.waterTemples.parent).toBe(SkillId.WATER);
    expect(SKILLS.forestTemple.parent).toBe(SkillId.FORESTRY);
    expect(SKILLS.roads.parent).toBe(SkillId.FORESTRY);
    expect(SKILLS.defense.parent).toBe(SkillId.SHIELDS);
    expect(SKILLS.knights.parent).toBe(SkillId.RIDING);
    expect(SKILLS.bridges.parent).toBe(SkillId.RIDING);
    expect(SKILLS.climbing.parent).toBeNull();
    expect(SKILLS.water.parent).toBeNull();
    expect(SKILLS.forestry.parent).toBeNull();
    expect(SKILLS.science.parent).toBeNull();
    expect(SKILLS.shields.parent).toBeNull();
    expect(SKILLS.riding.parent).toBeNull();
  });

  it('gates bridges behind riding', () => {
    expect(SKILLS.bridges.level).toBe(2);
    expect(canOpenSkill(player(100), SkillId.BRIDGES)).toBe(false);
    expect(canOpenSkill(player(100, [SkillId.RIDING]), SkillId.BRIDGES)).toBe(true);
    expect(openSkill(player(100, [SkillId.RIDING]), SkillId.BRIDGES)).toBe(true);
  });

  it('scales the cost with the number of already opened skills', () => {
    expect(skillCost(SkillId.CLIMBING, 0)).toBe(3);
    expect(skillCost(SkillId.CLIMBING, 1)).toBe(5);
    expect(skillCost(SkillId.CLIMBING, 2)).toBe(7);
    expect(skillCost(SkillId.SMITHERY, 0)).toBe(6);
    expect(skillCost(SkillId.SMITHERY, 3)).toBe(12);
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
    expect(canOpenSkill(player(100), SkillId.CLIMBING)).toBe(true);
    expect(canOpenSkill(player(100), SkillId.SMITHERY)).toBe(false);
    expect(canOpenSkill(player(100, [SkillId.CLIMBING]), SkillId.SMITHERY)).toBe(true);
    expect(canOpenSkill(player(2), SkillId.CLIMBING)).toBe(false);
  });

  it('openSkill pays money, adds the skill, and rejects repeat/ungated opens', () => {
    const p = player(100);
    expect(openSkill(p, SkillId.CLIMBING)).toBe(true);
    expect(p.skills).toEqual([SkillId.CLIMBING]);
    expect(p.resources.money).toBe(97);
    expect(openSkill(p, SkillId.CLIMBING)).toBe(false);
    const q = player(100);
    expect(openSkill(q, SkillId.SMITHERY)).toBe(false);
    expect(q.skills).toEqual([]);
    const broke = player(2);
    expect(openSkill(broke, SkillId.FORESTRY)).toBe(false);
    expect(broke.skills).toEqual([]);
  });

  it('charges the scaled cost for every opened skill', () => {
    const p = player(100, [SkillId.CLIMBING, SkillId.SCIENCE]);
    expect(openSkill(p, SkillId.FORESTRY)).toBe(true);
    expect(p.resources.money).toBe(100 - (3 + 2 * 2));
  });

  it('hasSkill checks the list', () => {
    expect(hasSkill(player(0, [SkillId.FORESTRY]), SkillId.FORESTRY)).toBe(true);
    expect(hasSkill(player(0), SkillId.FORESTRY)).toBe(false);
  });

  it('catapult requires the shields parent and costs 8 right after shields', () => {
    expect(canOpenSkill(player(100), SkillId.CATAPULT)).toBe(false);
    expect(canOpenSkill(player(100, [SkillId.SCIENCE]), SkillId.CATAPULT)).toBe(false);
    expect(canOpenSkill(player(100, [SkillId.SHIELDS]), SkillId.CATAPULT)).toBe(true);
    expect(skillCost(SkillId.CATAPULT, 1)).toBe(8);
  });

  it('randomUnopenedSkill returns an unopened skill of any level', () => {
    const p = player(0, [SkillId.CLIMBING, SkillId.WATER, SkillId.FORESTRY, SkillId.SCIENCE, SkillId.SHIELDS]);
    for (let i = 0; i < 50; i++) {
      const id = randomUnopenedSkill(p, Math.random);
      expect(id).not.toBeNull();
      expect(p.skills).not.toContain(id);
    }
    expect(randomUnopenedSkill(p, () => 0)).toBe(SkillId.SMITHERY);
    expect(randomUnopenedSkill(p, () => 0.9999)).toBeDefined();
  });

  it('randomUnopenedSkill returns null when every skill is open', () => {
    const p = player(0, Object.keys(SKILLS) as SkillId[]);
    expect(randomUnopenedSkill(p, () => 0.5)).toBeNull();
  });
});
