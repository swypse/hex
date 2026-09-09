import { describe, it, expect } from 'vitest';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { planAiActions } from '../src/game/ai';
import { analyzeSituation, isNavalEnemy } from '../src/game/aiSituation';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import type { Player } from '../src/game/players';
import { SeededRandom } from '../src/util/random';
import { PIRATE_OWNER, type Unit } from '../src/game/units';
import { hexDistance } from '../src/game/hex';

function aiPlayer(over: Partial<Player> = {}): Player {
  return {
    index: 1,
    tribe: Tribe.Villagers,
    isHuman: false,
    name: 'AI',
    resources: { wood: 0, stone: 0, money: 0, ore: 0 },
    score: 0,
    kills: 0,
    skills: [],
    isActive: true,
    difficulty: 'normal',
    ...over,
  };
}

function pirate(id: string, q: number, r: number): Unit {
  return {
    id, owner: PIRATE_OWNER, type: 'pirate', q, r,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 20, attack: 30, attackDistance: 3, defense: 10, spawnVillage: null,
  };
}

function shipUnit(id: string, owner: number, q: number, r: number): Unit {
  const u = makeUnit(id, owner, 'warrior', q, r);
  u.shipLevel = 1;
  return u;
}

describe('Naval threat detection', () => {
  it('isNavalEnemy flags pirates and ships but not land units', () => {
    const p = pirate('p', 0, 0);
    const s = shipUnit('s', 0, 0, 0);
    const w = makeUnit('w', 0, 'warrior', 0, 0);
    expect(isNavalEnemy(p)).toBe(true);
    expect(isNavalEnemy(s)).toBe(true);
    expect(isNavalEnemy(w)).toBe(false);
  });

  it('reports a naval threat when a pirate is near an AI unit or settlement', () => {
    const map = makeTestMap(8);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 100, ore: 0 } });
    const s = analyzeSituation(map, player, 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 10 });
    expect(s.navalThreat).toBe(true);
    expect(s.navalEnemies.length).toBe(1);
    expect(s.nearestNaval!.distance).toBe(3);
  });

  it('also counts an enemy ship as a naval threat', () => {
    const map = makeTestMap(8);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = shipUnit('enemy-ship', 0, 2, 0);
    const s = analyzeSituation(map, aiPlayer(), 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 10 });
    expect(s.navalThreat).toBe(true);
    expect(s.navalEnemies.length).toBe(1);
  });

  it('reports no threat when the pirate is beyond the radius', () => {
    const map = makeTestMap(12);
    const aiCap = tileAt(map, 0, 0)!;
    aiCap.settlement = { owner: 1, level: 1, captureReady: false };
    aiCap.ownedBy = 1;
    tileAt(map, 11, 0)!.terrain = TileType.Water;
    tileAt(map, 11, 0)!.unit = pirate('p1', 11, 0);
    const s = analyzeSituation(map, aiPlayer(), 'capture', { ...AI_DIFFICULTY_PROFILES.normal, navalThreatRadius: 6 });
    expect(s.navalThreat).toBe(false);
    expect(s.navalEnemies).toEqual([]);
  });
});

describe('AiDifficulty naval profile', () => {
  it('exposes a navalThreatRadius knob that grows with difficulty', () => {
    const easy = AI_DIFFICULTY_PROFILES.easy.navalThreatRadius;
    const normal = AI_DIFFICULTY_PROFILES.normal.navalThreatRadius;
    const hard = AI_DIFFICULTY_PROFILES.hard.navalThreatRadius;
    expect(easy).toBeLessThan(normal);
    expect(normal).toBeLessThan(hard);
    expect(normal).toBe(10);
  });
});

describe('Naval skill priority', () => {
  function coastalMap(): ReturnType<typeof makeTestMap> {
    const map = makeTestMap(6);
    // The AI settlement at (0,0) anchors the threat measurement; water is off
    // the coast with a pirate further out at (3,0).
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    return map;
  }

  it('opens Water first while threatened instead of the economy order', () => {
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 10, ore: 0 } });
    const actions = planAiActions(coastalMap(), player, new SeededRandom(1), 'capture');
    const firstSkill = actions.find((a) => a.type === 'openSkill');
    expect(firstSkill).toBeDefined();
    if (firstSkill && firstSkill.type === 'openSkill') expect(firstSkill.skill).toBe('water');
  });

  it('opens Navigation when Water is already open and the coast is threatened', () => {
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 0, stone: 0, money: 40, ore: 0 },
    });
    const actions = planAiActions(coastalMap(), player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'openSkill' && a.skill === 'navigation')).toBe(true);
  });

  it('does not prioritize Water when no naval enemy is near', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 10, ore: 0 } });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const firstSkill = actions.find((a) => a.type === 'openSkill');
    // Without a threat the economy order leads with Forestry, never Water.
    expect(firstSkill).toBeDefined();
    if (firstSkill && firstSkill.type === 'openSkill') expect(firstSkill.skill).toBe('forestry');
  });
});
