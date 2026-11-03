import type { Player } from '../players';
import { AiGoalId, AiPersonalityId, SkillId, UnitType } from '@enums';

/** A play style. Same tribe, different game: goal weights steer economy vs army,
 *  the rest tune spawns, spending, retreating and the tech path. */
interface AiPersonality {
  id: AiPersonalityId;
  goalWeights: Record<AiGoalId, number>;
  musterMinUnits: number;
  /** Offense spawns try these unit types first (in order), before the default priority. */
  offenseTypes: UnitType[];
  /** Added to the money kept in reserve while a plan is running (negative: spends sooner). */
  reserveDelta: number;
  /** Units at or below this share of their max hp pull back to heal. */
  retreatHpRatio: number;
  /** Skills in the order the AI opens them when no strategy chain applies; null: the default order. */
  skillOrder: SkillId[] | null;
  /** Price asked for trade goods, as a multiple of their fair value. */
  tradeMargin: number;
}

const MILITARY_FIRST: SkillId[] = [SkillId.FORESTRY, SkillId.CLIMBING, SkillId.SMITHERY, SkillId.SWORDSMAN, SkillId.RIDING, SkillId.KNIGHTS, SkillId.AGRICULTURE, SkillId.ARCHER, SkillId.SHIELDS, SkillId.SCIENCE, SkillId.GEOLOGY, SkillId.ROADS];
const ECONOMY_FIRST: SkillId[] = [SkillId.FORESTRY, SkillId.AGRICULTURE, SkillId.CLIMBING, SkillId.SCIENCE, SkillId.GEOLOGY, SkillId.SMITHERY, SkillId.ROADS, SkillId.ARCHER, SkillId.SHIELDS, SkillId.SWORDSMAN, SkillId.RIDING, SkillId.KNIGHTS];
const RAID_FIRST: SkillId[] = [SkillId.FORESTRY, SkillId.CLIMBING, SkillId.RIDING, SkillId.SMITHERY, SkillId.SWORDSMAN, SkillId.KNIGHTS, SkillId.AGRICULTURE, SkillId.ROADS, SkillId.CATAPULT, SkillId.SCIENCE, SkillId.GEOLOGY];

export const AI_PERSONALITIES: Record<AiPersonalityId, AiPersonality> = {
  /** Attacks first: strong melee, early military tech, captures preferred over building up. */
  aggressive: {
    id: AiPersonalityId.AGGRESSIVE, goalWeights: { economy: 0.6, army: 2.0, defense: 0.9, naval: 0.4, score: 1.0 }, musterMinUnits: 3,
    offenseTypes: [UnitType.KNIGHT, UnitType.SWORDSMAN, UnitType.WARRIOR], reserveDelta: -2, retreatHpRatio: 0.35, skillOrder: MILITARY_FIRST, tradeMargin: 1.3,
  },
  /** Neutral: attack and economy in equal share, the default order everywhere. */
  balanced: {
    id: AiPersonalityId.BALANCED, goalWeights: { economy: 1.0, army: 1.0, defense: 1.0, naval: 0.7, score: 1.0 }, musterMinUnits: 4,
    offenseTypes: [], reserveDelta: 0, retreatHpRatio: 0.5, skillOrder: null, tradeMargin: 1.15,
  },
  /** Economy: farms, mines and upgrades first, a big ranged-supported push later. */
  builder: {
    id: AiPersonalityId.BUILDER, goalWeights: { economy: 2.0, army: 0.6, defense: 1.1, naval: 1.2, score: 1.0 }, musterMinUnits: 5,
    offenseTypes: [UnitType.CATAPULT, UnitType.ARCHER, UnitType.KNIGHT], reserveDelta: 4, retreatHpRatio: 0.6, skillOrder: ECONOMY_FIRST, tradeMargin: 1.0,
  },
  /** Raider: fast cheap units, small squads, siege engines for enemy buildings. */
  raider: {
    id: AiPersonalityId.RAIDER, goalWeights: { economy: 0.8, army: 1.6, defense: 0.8, naval: 0.6, score: 1.0 }, musterMinUnits: 2,
    offenseTypes: [UnitType.RIDER, UnitType.KNIGHT, UnitType.CATAPULT], reserveDelta: -2, retreatHpRatio: 0.4, skillOrder: RAID_FIRST, tradeMargin: 1.25,
  },
};

function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h;
}

const PERSONALITY_IDS = Object.values(AiPersonalityId);

/** The play style of an AI player: stable per name (names are drawn per game, so a tribe plays differently from game to game). */
export function personalityFor(player: Player): AiPersonality {
  return AI_PERSONALITIES[PERSONALITY_IDS[hashName(player.name) % PERSONALITY_IDS.length]!]!;
}
