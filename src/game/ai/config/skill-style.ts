import { AiPersonalityId, AiSkillStyle, SkillId } from '@enums';
import type { Player } from '../../players';
import { Tribe } from '../../tribes';
import { flagsFor } from './flags';
import { personalityFor } from './personality';

/** Skills of each style, parents first. Skills in no group (economy, roads, science, ...) belong to every style. */
export const SKILL_STYLE_SKILLS: Record<AiSkillStyle, SkillId[]> = {
  [AiSkillStyle.WATER]: [SkillId.WATER, SkillId.NAVIGATION, SkillId.WATER_TEMPLES],
  [AiSkillStyle.DEFENSE]: [SkillId.SHIELDS, SkillId.DEFENSE, SkillId.TOWER, SkillId.MEDICINE],
  [AiSkillStyle.SWORDSMAN]: [SkillId.SWORDSMAN],
  [AiSkillStyle.KNIGHT]: [SkillId.RIDING, SkillId.KNIGHTS],
  [AiSkillStyle.RANGED]: [SkillId.ARCHER, SkillId.CATAPULT],
};

const STYLES = Object.values(AiSkillStyle);

type Weights = Record<AiSkillStyle, number>;

const w = (water: number, defense: number, swordsman: number, knight: number, ranged: number): Weights => ({
  [AiSkillStyle.WATER]: water, [AiSkillStyle.DEFENSE]: defense, [AiSkillStyle.SWORDSMAN]: swordsman, [AiSkillStyle.KNIGHT]: knight, [AiSkillStyle.RANGED]: ranged,
});

/** How likely each tribe is to choose each style (relative weights). */
const TRIBE_STYLE_WEIGHTS: Record<Tribe, Weights> = {
  [Tribe.Villagers]: w(1, 1, 2, 1, 1),
  [Tribe.Warriors]: w(0.5, 0.5, 2, 2, 1),
  [Tribe.Barbarians]: w(0.5, 0.3, 3, 1.5, 0.5),
  [Tribe.Cats]: w(1, 3, 0.7, 0.7, 1.5),
  [Tribe.Forest]: w(0.5, 1.5, 1, 0.5, 2),
  [Tribe.Aqua]: w(4, 1, 0.5, 0.3, 1.5),
  [Tribe.Sand]: w(0.5, 0.7, 1, 2, 1.5),
};

/** How likely each personality is to choose each style (multiplied with the tribe's weights). */
const PERSONALITY_STYLE_WEIGHTS: Record<AiPersonalityId, Weights> = {
  [AiPersonalityId.AGGRESSIVE]: w(0.5, 0.5, 1.5, 1.5, 1),
  [AiPersonalityId.BALANCED]: w(1, 1, 1, 1, 1),
  [AiPersonalityId.BUILDER]: w(1.2, 1.5, 0.7, 0.7, 1.5),
  [AiPersonalityId.RAIDER]: w(0.5, 0.3, 1, 2, 0.6),
};

function hash(text: string): number {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** The tech style of an AI player: a weighted draw from its tribe and personality, stable for the whole game (derived from the name). */
export function skillStyleFor(player: Pick<Player, 'name' | 'tribe' | 'personality'>): AiSkillStyle {
  const tribe = TRIBE_STYLE_WEIGHTS[player.tribe];
  const personality = PERSONALITY_STYLE_WEIGHTS[personalityFor(player).id];
  const weights = STYLES.map((s) => tribe[s] * personality[s]);
  let roll = (hash(`${player.name}|${player.tribe}`) / 4294967296) * weights.reduce((a, b) => a + b, 0);
  for (const [i, weight] of weights.entries()) {
    roll -= weight;
    if (roll < 0) return STYLES[i]!;
  }
  return STYLES[STYLES.length - 1]!;
}

/** The skill order restyled: after the first two economy skills come the style's own skills, skills of other styles are dropped. */
export function styledSkillOrder(base: SkillId[], style: AiSkillStyle): SkillId[] {
  const foreign = new Set(STYLES.filter((s) => s !== style).flatMap((s) => SKILL_STYLE_SKILLS[s]));
  const own = SKILL_STYLE_SKILLS[style];
  const neutral = base.filter((id) => !foreign.has(id) && !own.includes(id));
  return [...neutral.slice(0, 2), ...own, ...neutral.slice(2)];
}

/** False for a skill of another style than the player's (always true with the `skillStyles` flag off). */
export function styleAllowsSkill(player: Pick<Player, 'name' | 'tribe' | 'personality' | 'aiFlags'>, id: SkillId): boolean {
  if (!flagsFor(player).skillStyles) return true;
  const own = skillStyleFor(player);
  return !STYLES.some((s) => s !== own && SKILL_STYLE_SKILLS[s].includes(id));
}
