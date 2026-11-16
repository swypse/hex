import { AiPersonalityId, AiSkillStyle, SkillId } from '@enums';
import { describe, expect, it } from 'vitest';
import { SKILL_STYLE_SKILLS, skillStyleFor, styleAllowsSkill, styledSkillOrder } from '../src/game/ai/config/skill-style';
import { Tribe } from '../src/game/tribes';

const base = [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.ARCHER, SkillId.CLIMBING, SkillId.SWORDSMAN, SkillId.RIDING, SkillId.SHIELDS, SkillId.WATER, SkillId.ROADS];

describe('styledSkillOrder', () => {
  it('puts own skills after the first two economy skills and drops other styles', () => {
    const order = styledSkillOrder(base, AiSkillStyle.WATER);
    expect(order.slice(0, 4)).toEqual([SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.WATER, SkillId.NAVIGATION]);
    for (const banned of [SkillId.ARCHER, SkillId.SWORDSMAN, SkillId.RIDING, SkillId.SHIELDS]) expect(order).not.toContain(banned);
    expect(order).toContain(SkillId.CLIMBING);
    expect(order).toContain(SkillId.ROADS);
  });

  it('keeps every skill of the chosen group in parent-first order', () => {
    const order = styledSkillOrder(base, AiSkillStyle.DEFENSE);
    const own = SKILL_STYLE_SKILLS[AiSkillStyle.DEFENSE];
    expect(order.filter((id) => own.includes(id))).toEqual(own);
  });
});

describe('skillStyleFor', () => {
  const player = (name: string, tribe: Tribe, personality = AiPersonalityId.BALANCED) => ({ name, tribe, personality });

  it('is stable for a player', () => {
    expect(skillStyleFor(player('Mia', Tribe.Cats))).toBe(skillStyleFor(player('Mia', Tribe.Cats)));
  });

  it('favours defense for cats and water for aqua', () => {
    const count = (tribe: Tribe, style: AiSkillStyle): number =>
      Array.from({ length: 400 }, (_, i) => skillStyleFor(player(`p${i}`, tribe))).filter((s) => s === style).length;
    expect(count(Tribe.Cats, AiSkillStyle.DEFENSE)).toBeGreaterThan(100);
    expect(count(Tribe.Aqua, AiSkillStyle.WATER)).toBeGreaterThan(150);
    expect(count(Tribe.Barbarians, AiSkillStyle.DEFENSE)).toBeLessThan(60);
  });

  it('only allows skills of its own style, or no style', () => {
    const p = { ...player('Mia', Tribe.Aqua), aiFlags: undefined };
    const style = skillStyleFor(p);
    for (const s of Object.values(AiSkillStyle)) for (const id of SKILL_STYLE_SKILLS[s]) expect(styleAllowsSkill(p, id)).toBe(s === style);
    expect(styleAllowsSkill(p, SkillId.ROADS)).toBe(true);
  });
});
