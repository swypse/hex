import { describe, expect, it } from 'vitest';
import { AiActionType, SkillId, SpawnPreference, UnitType } from '@enums';
import { migrateLegacyResources } from '../src/game/economy/stock';
import { type GameMap } from '../src/game/map/map-gen';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { AI_PATTERNS, bestSpawnableUnitType, holdMargin, unitHoldsVillage } from '../src/game/ai/ai-patterns';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(skills: Player['skills'] = []): Player {
  return {
    index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 20, stone: 20, money: 100, ore: 10, food: 20 },
    score: 0, kills: 0, skills, isActive: true,
  } as Player;
}

function freshState(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

const pattern = (id: string) => AI_PATTERNS.find((p) => p.id === id)!;

function put(map: GameMap, owner: number, type: UnitType, q: number, r: number, hp?: number) {
  const u = makeUnit(`${type}-${owner}-${q},${r}`, owner, type, q, r);
  if (hp !== undefined) u.hp = hp;
  tileAt(map, q, r)!.unit = u;
  return u;
}

/** Own village at (0,0) with an enemy knight three hexes away. */
function threatened(): { map: GameMap; village: NonNullable<ReturnType<typeof tileAt>> } {
  const map = makeTestMap(6);
  const village = tileAt(map, 0, 0)!;
  village.settlement = { owner: AI, level: 1, captureReady: false, capital: true };
  village.ownedBy = AI;
  put(map, 0, UnitType.KNIGHT, 3, 0);
  return { map, village };
}

describe('holding a threatened village', () => {
  it('a 1-hp unit does not hold, a healthy shield does', () => {
    const { map, village } = threatened();
    expect(unitHoldsVillage(map, village, AI, makeUnit('w', AI, UnitType.WARRIOR, 0, 0))).toBe(true);
    const weak = makeUnit('w1', AI, UnitType.WARRIOR, 0, 0);
    weak.hp = 1;
    expect(holdMargin(map, village, AI, weak)).toBeLessThanOrEqual(0);
  });

  it('garrison-empty-village does not send a 1-hp unit into the village', () => {
    const { map } = threatened();
    put(map, AI, UnitType.WARRIOR, -1, 0, 1);
    const p = aiPlayer();
    migrateLegacyResources(map, [p]);
    const actions = pattern('garrison-empty-village').evaluate({ map, player: p, rng: new SeededRandom(1), state: freshState() });
    expect(actions).toBeNull();
  });

  it('garrison-empty-village still sends a healthy unit', () => {
    const { map } = threatened();
    const unit = put(map, AI, UnitType.WARRIOR, -1, 0);
    const p = aiPlayer();
    migrateLegacyResources(map, [p]);
    const actions = pattern('garrison-empty-village').evaluate({ map, player: p, rng: new SeededRandom(1), state: freshState() });
    expect(actions).toEqual([{ type: AiActionType.MOVE, unitId: unit.id, q: 0, r: 0 }]);
  });

  it('a defense spawn next to a knight is not an archer', () => {
    const { map, village } = threatened();
    const p = aiPlayer([SkillId.ARCHER, SkillId.SWORDSMAN, SkillId.SHIELDS]);
    migrateLegacyResources(map, [p]);
    const type = bestSpawnableUnitType(p, SpawnPreference.DEFENSE, map, village);
    expect(type).not.toBeNull();
    expect(type).not.toBe(UnitType.ARCHER);
  });
});
