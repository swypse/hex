import type { Player } from './players';
import type { AiGoalId } from './aiTypes';

export type AiPersonalityId = 'aggressive' | 'balanced' | 'builder';

export interface AiPersonality {
  id: AiPersonalityId;
  goalWeights: Record<AiGoalId, number>;
  musterMinUnits: number;
}

export const AI_PERSONALITIES: Record<AiPersonalityId, AiPersonality> = {
  aggressive: { id: 'aggressive', goalWeights: { economy: 0.6, army: 2.0, defense: 0.9, naval: 0.4, score: 1.0 }, musterMinUnits: 3 },
  balanced: { id: 'balanced', goalWeights: { economy: 1.0, army: 1.0, defense: 1.0, naval: 0.7, score: 1.0 }, musterMinUnits: 4 },
  builder: { id: 'builder', goalWeights: { economy: 2.0, army: 0.6, defense: 1.1, naval: 1.2, score: 1.0 }, musterMinUnits: 5 },
};

function hashName(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0x7fffffff;
  return h;
}

export function personalityFor(player: Player): AiPersonality {
  const ids: AiPersonalityId[] = ['aggressive', 'balanced', 'builder'];
  return AI_PERSONALITIES[ids[hashName(player.name) % ids.length]!]!;
}