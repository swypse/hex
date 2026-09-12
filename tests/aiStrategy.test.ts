import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES, profileFor } from '../src/game/aiDifficulty';
import { AI_PERSONALITIES, personalityFor } from '../src/game/aiPersonality';
import { SpawnPreference } from '../src/game/aiTypes';
import { Player } from '../src/game/players';
import { updateStrategy, goalTargetKey, productionBuildings } from '../src/game/aiStrategy';
import { analyzeSituation } from '../src/game/aiSituation';
import { SeededRandom } from '../src/util/random';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import { GameMode } from '../src/game/gameMode';

function aiPlayer(name: string): Player {
  return {
    index: 1, tribe: 3, isHuman: false, name,
    resources: { wood: 5, stone: 5, money: 100, ore: 5 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function makeTile(q: number, r: number, ownedBy: number | null = null, settlement: Settlement | null = null, unit: Unit | null = null): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defense: 0, spawnVillage: null };
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

describe('AiStrategy lifecycle', () => {
  const mode: GameMode = 'capture';

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
    expect(s2.goals[0]!.sinceTurn).toBe(1);
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
    expect(s.goals.some((g) => g.id === 'defense')).toBe(true);
    map.tiles.pop();
    const s2 = updateStrategy(map, p, analyzeSituation(map, p, mode, profile), mode, profile, 1 + profile.strategy.planIntervalTurns, new SeededRandom(1));
    expect(s2.goals.some((g) => g.id === 'defense')).toBe(false);
  });

  it('tracks production buildings and exposes a stable goal target key', () => {
    const map = twoVillageMap();
    map.tiles[1]!.building = { kind: 'mine', level: 1 };
    const p = v1();
    expect(productionBuildings(map, p)).toBe(1);
    const s = updateStrategy(map, p, analyzeSituation(map, p, mode, profileFor(p)), mode, profileFor(p), 1, new SeededRandom(1));
    if (s.goals[0]!.target) expect(goalTargetKey(s.goals[0]!)).toBe(`${s.goals[0]!.target!.q},${s.goals[0]!.target!.r}`);
  });
});