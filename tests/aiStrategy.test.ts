import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { AI_PERSONALITIES, personalityFor } from '../src/game/aiPersonality';
import { SpawnPreference } from '../src/game/aiTypes';
import { Player } from '../src/game/players';

function aiPlayer(name: string): Player {
  return {
    index: 1, tribe: 3, isHuman: false, name,
    resources: { wood: 5, stone: 5, money: 100, ore: 5 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

describe('AI strategy types & personalities', () => {
  it('every difficulty profile has a strategy group with sane bounds', () => {
    for (const key of ['easy', 'normal', 'hard'] as const) {
      const s = AI_DIFFICULTY_PROFILES[key].strategy;
      expect(s.planIntervalTurns).toBeGreaterThan(0);
      expect(s.musterFactor).toBeGreaterThan(0);
      expect(s.assaultRatio).toBeGreaterThan(0);
      expect(s.economyCap).toBeGreaterThanOrEqual(0);
    }
  });

  it('personality assignment is deterministic per name', () => {
    const a1 = personalityFor(aiPlayer('Sable'));
    const a2 = personalityFor(aiPlayer('Sable'));
    expect(a1.id).toBe(a2.id);
  });

  it('covers all three personality ids across many names', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(personalityFor(aiPlayer(`p${i}`)).id);
    expect(ids.size).toBe(3);
  });

  it('exposes the SpawnPreference union through aiTypes', () => {
    const prefs: SpawnPreference[] = ['offense', 'defense', 'scout', 'naval'];
    expect(prefs).toHaveLength(4);
  });
});