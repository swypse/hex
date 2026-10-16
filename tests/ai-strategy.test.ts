import { planAiActions } from '@/game/ai/ai';
import { AI_DIFFICULTY_PROFILES, profileFor } from '@/game/ai/ai-difficulty';
import { AI_PERSONALITIES, personalityFor } from '@/game/ai/ai-personality';
import { bestSpawnableUnitType } from '@/game/ai/ai-patterns';
import { analyzeSituation } from '@/game/ai/ai-situation';
import {
  chooseArmyTarget, deriveDirectives, ensurePlayerStrategy, goalTargetKey, productionBuildings, updateStrategy
} from '@/game/ai/ai-strategy';
import { type AiStrategyState } from '@/game/ai/ai-types';
import { type GameMap, type MapTile, type Settlement } from '@/game/map/map-gen';
import { type Player } from '@/game/players';
import { TileType } from '@/game/map/tile-types';
import { type Unit } from '@/game/units/units';
import { SeededRandom } from '@/util';
import { AiActionType, AiGoalId, AiPace, AiPersonalityId, BuildingKind, SkillId, GameMode, SpawnPreference, UnitType } from '@enums';
import { describe, expect, it } from 'vitest';

function aiPlayer(name: string): Player {
  return {
    index: 1, tribe: 3, isHuman: false, name,
    resources: { wood: 5, stone: 5, money: 100, ore: 5, food: 20 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function makeTile(q: number, r: number, ownedBy: number | null = null, settlement: Settlement | null = null, unit: Unit | null = null): MapTile {
  return {
    q,
    r,
    terrain: TileType.GrasslandLand,
    settlement,
    unit,
    ownedBy,
    claimedByVillage: null,
    building: null,
    exploredBy: [0, 1]
  };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return {
    id,
    owner,
    type: UnitType.WARRIOR,
    q,
    r,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 50,
    attack: 20,
    attackDistance: 1,
    defense: 0,
    spawnVillage: null
  };
}

function twoVillageMap(): GameMap {
  const tiles: MapTile[] = [
    makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
    makeTile(1, 0, 1, { owner: 1, level: 1, captureReady: false }),
    makeTile(2, 0),
    makeTile(3, 0),
    makeTile(4, 0, 0, { owner: 0, level: 1, captureReady: false }),
  ];
  return { radius: 4, tiles, spawns: [] };
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

  it('covers every personality id across many names', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 60; i++) ids.add(personalityFor(aiPlayer(`p${i}`)).id);
    expect(ids.size).toBe(4);
  });

  it('exposes the SpawnPreference union through aiTypes', () => {
    const prefs: SpawnPreference[] = [SpawnPreference.OFFENSE, SpawnPreference.DEFENSE, SpawnPreference.SCOUT, SpawnPreference.NAVAL];
    expect(prefs).toHaveLength(4);
  });
});

describe('AiStrategy lifecycle', () => {
  const mode: GameMode = GameMode.CAPTURE;

  function v1(name = 'Adaro'): Player {
    return aiPlayer(name);
  }

  it('starts with a persisted strategy state and a primary economy/army or score goal', () => {
    const p = v1();
    const map = twoVillageMap();
    const situation = analyzeSituation(map, p, mode, profileFor(p));
    const state = updateStrategy(map, p, situation, mode, profileFor(p), 1, new SeededRandom(1));
    expect(p.strategy).toBe(state);
    expect(state.goals.length).toBeGreaterThan(0);
    expect(['economy', 'army', 'score']).toContain(state.goals[0]!.id);
  });

  it('keeps the same goal set between the plan interval (persistence)', () => {
    const p = v1();
    const map = twoVillageMap();
    const profile = profileFor(p);
    const s1 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1));
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 2, new SeededRandom(1));
    expect(s2.goals.map((g) => g.id)).toEqual(s1.goals.map((g) => g.id));
  });

  it('re-picks after the plan interval passes', () => {
    const p = v1();
    const map = twoVillageMap();
    const profile = profileFor(p);
    const before = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1)).nextPlanTurn;
    const after = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1 + profile.strategy.planIntervalTurns + 1, new SeededRandom(1)).nextPlanTurn;
    expect(after).toBeGreaterThan(before);
  });

  it('adds a defense goal when endangered and drops it when safe again', () => {
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, 2, 0, null, makeWarrior('e1', 0, 0, 2)));
    const p = v1();
    const profile = profileFor(p);
    const s = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1, new SeededRandom(1));
    expect(s.goals.some((g) => g.id === AiGoalId.DEFENSE)).toBe(true);
    map.tiles.pop();
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1 + profile.strategy.planIntervalTurns, new SeededRandom(1));
    expect(s2.goals.some((g) => g.id === AiGoalId.DEFENSE)).toBe(false);
  });

  it('tracks production buildings and exposes a stable goal target key', () => {
    const map = twoVillageMap();
    map.tiles[1]!.building = { kind: BuildingKind.MINE, level: 1 };
    const p = v1();
    expect(productionBuildings(map, p)).toBe(1);
    const s = updateStrategy(map, p, analyzeSituation(map, p, mode, profileFor(p)), mode, profileFor(p), 1, new SeededRandom(1));
    if (s.goals[0]!.target) expect(goalTargetKey(s.goals[0]!)).toBe(`${s.goals[0]!.target!.q},${s.goals[0]!.target!.r}`);
  });
});

describe('AiStrategy deriveDirectives', () => {
  const mode: GameMode = GameMode.CAPTURE;
  const rng = new SeededRandom(1);

  function pickPrimary(s: AiStrategyState): string {
    return s.goals.find((g) => g.id === AiGoalId.ECONOMY || g.id === AiGoalId.ARMY)!.id;
  }

  function planState(name: string, turn = 1, m = mode): AiStrategyState {
    const p = aiPlayer(name);
    const profile = profileFor(p);
    const map = twoVillageMap();
    return updateStrategy(map, p, analyzeSituation(map, p, m, profile), m, profile, turn, rng);
  }

  it('emits a neutral directive set for a fresh player (no goals)', () => {
    const p = aiPlayer('Adaro');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = ensurePlayerStrategy(p, rng);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.frontTarget).toBeNull();
    expect(d.muster).toBeNull();
    expect(d.spawnPlan).toEqual([]);
    expect(d.moneyReserve).toBe(8);
    expect(d.skillChain).toBeNull();
    expect(d.pace).toBe(AiPace.NORMAL);
  });

  it('economy goal sets a slow pace, reserve, and economy skill chain', () => {
    const state = planState('Obe');
    expect(pickPrimary(state)).toBe('economy');
    const p = aiPlayer('Obe');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.pace).toBe(AiPace.SLOW);
    expect(d.moneyReserve).toBeGreaterThanOrEqual(12);
    expect(d.skillChain).not.toBeNull();
  });

  it('army goal emits a front target toward the enemy village and an offense spawn plan', () => {
    const state = planState('Ragnar', 8);
    expect(pickPrimary(state)).toBe('army');
    const p = aiPlayer('Ragnar');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.frontTarget).not.toBeNull();
    expect(d.spawnPlan.some((s) => s.prefer === SpawnPreference.OFFENSE)).toBe(true);
  });

  it('defense goal reverts the money reserve to 0 and targets the endangered village', () => {
    const p = aiPlayer('Sable');
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, 2, 0, null, makeWarrior('e1', 0, 0, 2)));
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 1, rng);
    expect(state.goals.some((g) => g.id === AiGoalId.DEFENSE)).toBe(true);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.moneyReserve).toBe(0);
    expect(d.pace).toBe(AiPace.RUSHED);
    expect(d.frontTarget).not.toBeNull();
  });

  it('naval goal opens the naval skill chain first', () => {
    const p = aiPlayer('Mara');
    const map = twoVillageMap();
    map.tiles.push(makeTile(0, -2, 0, null, { ...makeWarrior('e1', -1, 0, -2), shipLevel: 1 }));
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, mode, profile);
    const state = updateStrategy(map, p, situation, mode, profile, 1, rng);
    expect(state.goals.some((g) => g.id === AiGoalId.NAVAL)).toBe(true);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.skillChain).not.toBeNull();
  });

  it('score goal sets a rushed pace and zero reserve in 30-turn mode', () => {
    const state = planState('Kade', 12, GameMode.TURNS30);
    expect(state.goals.some((g) => g.id === AiGoalId.SCORE)).toBe(true);
    const p = aiPlayer('Kade');
    const map = twoVillageMap();
    const profile = profileFor(p);
    const situation = analyzeSituation(map, p, GameMode.TURNS30, profile);
    const d = deriveDirectives(map, p, situation, profile, state);
    expect(d.pace).toBe(AiPace.RUSHED);
    expect(d.moneyReserve).toBe(0);
  });

  it('personalities diverge: aggressive picks army, builder picks economy on the same map', () => {
    expect(pickPrimary(planState('Zed'))).toBe('army');
    expect(pickPrimary(planState('Obe'))).toBe('economy');
  });
});
describe('planAiActions with strategy', () => {
  it('keeps a bare one-village map on today behaviour (no crash, actions produced)', () => {
    const tiles: MapTile[] = [
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
      makeTile(1, 0),
      makeTile(2, 0),
    ];
    const map: GameMap = { radius: 4, tiles, spawns: [] };
    const actions = planAiActions(map, aiPlayer('Ona'), new SeededRandom(1), GameMode.CAPTURE);
    expect(actions.length).toBeGreaterThan(0);
  });

  it('army-plan moves units toward the enemy village front', () => {
    const map: GameMap = {
      radius: 6, tiles: [
        makeTile(0, 0, null, null, makeWarrior('g1', 1, 0, 0)),
        makeTile(1, 0),
        makeTile(2, 0, 1, { owner: 1, level: 1, captureReady: false }),
        makeTile(3, 0),
        makeTile(4, 0),
        makeTile(5, 0, 0, { owner: 0, level: 1, captureReady: false }),
      ], spawns: []
    };
    const actions = planAiActions(map, aiPlayer('Ragnar'), new SeededRandom(1), GameMode.CAPTURE);
    const moves = actions.filter((a) => a.type === AiActionType.MOVE);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.type === AiActionType.MOVE && m.q > 0)).toBe(true);
  });

  it('passes the turn through to the planner (no crash across turns)', () => {
    const map = twoVillageMap();
    const p = aiPlayer('Drake');
    for (let turn = 1; turn <= 12; turn++) {
      const actions = planAiActions(map, p, new SeededRandom(turn), GameMode.CAPTURE);
      expect(actions.length).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('army target commitment', () => {
  const mode = GameMode.CAPTURE;

  it('chooseArmyTarget skips unreachable villages', () => {
    const p = aiPlayer('Ragnar');
    const map = twoVillageMap();
    // Cut-off, higher-level enemy village with no explored land link to ours.
    map.tiles.push(makeTile(0, 9, 0, { owner: 0, level: 3, captureReady: false }));
    expect(chooseArmyTarget(map, p)).toEqual({ q: 4, r: 0 });
  });

  it('chooseArmyTarget prefers the weakly held village over a guarded nearer one', () => {
    const p = aiPlayer('Ragnar');
    const map = twoVillageMap();
    // Guard the near village (4,0) with two enemy warriors; add an unguarded one two hexes farther.
    map.tiles.push(makeTile(4, 1, 0, null, makeWarrior('g2', 0, 4, 1)), makeTile(3, 1, 0, null, makeWarrior('g3', 0, 3, 1)));
    map.tiles.push(makeTile(2, 1), makeTile(1, 1), makeTile(0, 1), makeTile(-1, 1), makeTile(-1, 2), makeTile(0, 2, 0, { owner: 0, level: 1, captureReady: false }));
    expect(chooseArmyTarget(map, p)).toEqual({ q: 0, r: 2 });
  });

  it('an army goal without a target picks one once a village is known', () => {
    const p = aiPlayer('Ragnar');
    p.strategy = { personalityId: 'balanced', nextPlanTurn: 0, goals: [{ id: AiGoalId.ARMY, phase: 'choose', target: null }] };
    const map = twoVillageMap();
    const profile = profileFor(p);
    const state = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 0, new SeededRandom(3));
    const army = state.goals.find((g) => g.id === AiGoalId.ARMY);
    if (army) expect(army.target).not.toBeNull();
  });
});

describe('personality profiles', () => {
  it('differ in the knobs they tune', () => {
    const all = Object.values(AI_PERSONALITIES);
    expect(new Set(all.map((p) => p.retreatHpRatio)).size).toBeGreaterThan(2);
    expect(new Set(all.map((p) => p.reserveDelta)).size).toBeGreaterThan(2);
    expect(AI_PERSONALITIES.aggressive.goalWeights.army).toBeGreaterThan(AI_PERSONALITIES.builder.goalWeights.army);
    expect(AI_PERSONALITIES.builder.goalWeights.economy).toBeGreaterThan(AI_PERSONALITIES.aggressive.goalWeights.economy);
  });

  it('offense spawns start from the profile\'s favourite types', () => {
    const rich = (name: string): Player => ({ ...aiPlayer(name), skills: [SkillId.SWORDSMAN, SkillId.RIDING, SkillId.KNIGHTS], resources: { wood: 50, stone: 50, money: 200, ore: 50, food: 20 } });
    const named = (id: AiPersonalityId): string => {
      for (let i = 0; i < 200; i++) if (personalityFor(aiPlayer(`n${i}`)).id === id) return `n${i}`;
      throw new Error('no name');
    };
    const raider = bestSpawnableUnitType(rich(named(AiPersonalityId.RAIDER)), SpawnPreference.OFFENSE);
    const aggressive = bestSpawnableUnitType(rich(named(AiPersonalityId.AGGRESSIVE)), SpawnPreference.OFFENSE);
    expect(raider).toBe(UnitType.RIDER);
    expect(aggressive).toBe(UnitType.KNIGHT);
  });
});
