import { describe, expect, it } from 'vitest';
import { AiActionType, SkillId, SpawnPreference, UnitType } from '@enums';
import { migrateLegacyResources } from '../src/game/economy/stock';
import { ANTI_CATAPULT_PATTERNS } from '../src/game/ai/patterns/anti-catapult';
import { bestSpawnableUnitType, knightsWanted } from '../src/game/ai/ai-pattern-helpers';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function ai(skills: SkillId[] = []): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 50, stone: 50, money: 200, ore: 50, food: 20 },
    score: 0, kills: 0, skills, isActive: true,
  } as Player;
}

function state(): AiPlannerState {
  return { moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(), built: new Set(), opened: new Set(), occupied: new Set() };
}

function sceneWithCatapult() {
  const map = makeTestMap(5);
  for (const t of map.tiles) t.exploredBy = [0, 1];
  tileAt(map, 3, 0)!.unit = makeUnit('cat', 0, UnitType.CATAPULT, 3, 0);
  return map;
}

describe('knights against catapults', () => {
  it('researches the knight path when an enemy catapult is visible', () => {
    const map = sceneWithCatapult();
    const step = ANTI_CATAPULT_PATTERNS[0]!.evaluate({ map, player: ai(), rng: undefined as never, state: state() });
    expect(step?.[0]?.type).toBe(AiActionType.OPEN_SKILL);
  });

  it('does nothing without a catapult in sight', () => {
    const map = makeTestMap(5);
    for (const t of map.tiles) t.exploredBy = [0, 1];
    expect(ANTI_CATAPULT_PATTERNS[0]!.evaluate({ map, player: ai(), rng: undefined as never, state: state() })).toBeNull();
  });

  it('spawns a knight first once it is researched', () => {
    const map = sceneWithCatapult();
    const player = ai([SkillId.CLIMBING, SkillId.RIDING, SkillId.KNIGHTS, SkillId.SMITHERY]);
    expect(knightsWanted(map, player)).toBe(true);
    const village = tileAt(map, -3, 0)!;
    village.settlement = { owner: 1, level: 1, captureReady: false, capital: true };
    village.ownedBy = 1;
    migrateLegacyResources(map, [player]);
    expect(bestSpawnableUnitType(player, SpawnPreference.OFFENSE, map, village)).toBe(UnitType.KNIGHT);
  });
});
