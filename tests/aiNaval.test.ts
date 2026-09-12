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
    // Without a threat the economy order leads with an economy skill — the
    // exact first pick is jitter-sensitive, but Water must never be first.
    expect(firstSkill).toBeDefined();
    if (firstSkill && firstSkill.type === 'openSkill') expect(firstSkill.skill).not.toBe('water');
  });

  it('opens only the naval skill chain while threatened, never economy skills', () => {
    const allowed = new Set(['water', 'navigation', 'science', 'catapult']);
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 200, ore: 0 } });
    const actions = planAiActions(coastalMap(), player, new SeededRandom(1), 'capture');
    for (const a of actions) {
      if (a.type === 'openSkill') expect(allowed.has(a.skill), a.skill).toBe(true);
    }
  });
});

describe('Naval port building', () => {
  it('builds a port on the threatened coast when Water is known', () => {
    const map = makeTestMap(6);
    // Owned coast: land (0,0) with the AI settlement (so a naval threat is
    // detected) + water (1,0), with the pirate further out.
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 20, stone: 0, money: 100, ore: 5 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const build = actions.find((a) => a.type === 'build');
    expect(build).toBeDefined();
    if (build && build.type === 'build') {
      expect(build.kind).toBe('port');
      expect(build.q).toBe(1);
      expect(build.r).toBe(0);
    }
  });

  it('builds the port on the coast nearest the pirate when several are possible', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    // Two candidate own-coast water tiles: (1,0) next to the settlement and
    // (0,2) next to owned land (0,1).
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 2)!.terrain = TileType.Water;
    tileAt(map, 0, 2)!.ownedBy = 1;
    // Pirate is closer to (0,2) than to (1,0).
    tileAt(map, 0, 4)!.terrain = TileType.Water;
    tileAt(map, 0, 4)!.unit = pirate('p1', 0, 4);
    const player = aiPlayer({
      skills: ['water'],
      resources: { wood: 20, stone: 0, money: 100, ore: 5 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const build = actions.find((a) => a.type === 'build');
    expect(build).toBeDefined();
    if (build && build.type === 'build') {
      expect(build.kind).toBe('port');
      expect(build.q).toBe(0);
      expect(build.r).toBe(2);
    }
  });
});

describe('Naval boarding', () => {
  it('walks a spare unit onto an owned port to become a ship', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('crew', 1, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 1)!.building = { kind: 'port', level: 1 };
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const board = actions.find((a) => a.type === 'move' && a.unitId === 'crew');
    expect(board).toBeDefined();
    if (board && board.type === 'move') {
      expect(board.q).toBe(0);
      expect(board.r).toBe(1);
    }
  });

  it('does not board when the AI already has a ship', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('crew', 1, 'warrior', 0, 0);
    tileAt(map, 0, 1)!.terrain = TileType.Water;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 0, 1)!.building = { kind: 'port', level: 1 };
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = shipUnit('s1', 1, 2, 0);
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'move' && a.unitId === 'crew')).toBe(false);
  });
});

describe('Naval hunting', () => {
  it('sails a ship into firing range of a pirate and attacks without stopping adjacent', () => {
    const map = makeTestMap(6);
    // Continuous water row r=0: ship at (0,0), pirate at (3,0). The ship has
    // move 2 and attack range 2, so the only reachable firing tile is (1,0)
    // (distance 2 from the pirate). It must NOT stop at (2,0), which is
    // adjacent to the pirate and invites a capture attempt. The pirate is at
    // full strength so the generic favorable-trade check would refuse to fire;
    // only the dedicated naval-hunt pattern engages it.
    for (let q = 0; q <= 3; q++) tileAt(map, q, 0)!.terrain = TileType.Water;
    const p = pirate('p1', 3, 0);
    p.hp = 150;
    tileAt(map, 3, 0)!.unit = p;
    tileAt(map, 0, 0)!.unit = shipUnit('ship1', 1, 0, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const moveIdx = actions.findIndex((a) => a.type === 'move' && a.unitId === 'ship1');
    const attackIdx = actions.findIndex((a) => a.type === 'attack' && a.unitId === 'ship1');
    expect(moveIdx).toBeGreaterThanOrEqual(0);
    expect(attackIdx).toBe(moveIdx + 1);
    const move = actions[moveIdx]!;
    if (move.type === 'move') {
      expect(hexDistance({ q: move.q, r: move.r }, { q: 3, r: 0 })).toBe(2);
    }
    const attack = actions[attackIdx]!;
    if (attack.type === 'attack') {
      expect(attack.q).toBe(3);
      expect(attack.r).toBe(0);
    }
  });
});

describe('Naval ship upgrades', () => {
  it('plans to upgrade an idle ship while threatened and affordable', () => {
    const map = makeTestMap(6);
    // Owned water tile under the ship so it may be upgraded there.
    tileAt(map, 0, 0)!.terrain = TileType.Water;
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 0)!.unit = shipUnit('ship1', 1, 0, 0);
    tileAt(map, 3, 0)!.terrain = TileType.Water;
    tileAt(map, 3, 0)!.unit = pirate('p1', 3, 0);
    const player = aiPlayer({
      skills: ['water', 'navigation'],
      resources: { wood: 10, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    const up = actions.find((a) => a.type === 'upgradeShip' && a.unitId === 'ship1');
    expect(up).toBeDefined();
  });
});

describe('Naval catapults', () => {
  function catapultMap(): ReturnType<typeof makeTestMap> {
    const map = makeTestMap(6);
    // Catapult at (0,0), pirate at (5,0): distance 5, out of range. The only
    // land step that closes to firing range (distance 4) is (1,0); the two
    // alternate approach tiles (1,1) and (1,-1) are water so the choice is
    // deterministic. (1,0) is distance 4 -> safe from the pirate's range 3.
    tileAt(map, 0, 0)!.unit = makeUnit('cat1', 1, 'catapult', 0, 0);
    tileAt(map, 1, 0);
    tileAt(map, 1, 1)!.terrain = TileType.Water;
    tileAt(map, 1, -1)!.terrain = TileType.Water;
    tileAt(map, 5, 0)!.terrain = TileType.Water;
    tileAt(map, 5, 0)!.unit = pirate('p1', 5, 0);
    return map;
  }

  it('moves an idle catapult into firing range of the pirate', () => {
    const player = aiPlayer({
      skills: ['science', 'catapult'],
      resources: { wood: 0, stone: 0, money: 100, ore: 0 },
    });
    const actions = planAiActions(catapultMap(), player, new SeededRandom(1), 'capture');
    const move = actions.find((a) => a.type === 'move' && a.unitId === 'cat1');
    expect(move).toBeDefined();
    if (move && move.type === 'move') {
      expect(move.q).toBe(1);
      expect(move.r).toBe(0);
    }
  });

  it('spawns a catapult instead of a land attacker while the coast is threatened', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 0, 1)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 1;
    tileAt(map, 4, 0)!.terrain = TileType.Water;
    tileAt(map, 4, 0)!.unit = pirate('p1', 4, 0);
    const player = aiPlayer({
      skills: ['science', 'catapult', 'water'],
      resources: { wood: 100, stone: 0, money: 100, ore: 10 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'spawn' && a.unitType === 'catapult')).toBe(true);
  });
});

describe('Naval defensive guards', () => {
  it('keeps a melee unit from marching toward or attacking an unreachable pirate', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.unit = makeUnit('w1', 1, 'warrior', 0, 0);
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.terrain = TileType.Water;
    tileAt(map, 2, 0)!.unit = pirate('p1', 2, 0);
    const player = aiPlayer({ resources: { wood: 0, stone: 0, money: 100, ore: 0 } });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'attack' && a.q === 2 && a.r === 0)).toBe(false);
    const start = hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 });
    for (const a of actions) {
      if (a.type === 'move' && a.unitId === 'w1') {
        expect(hexDistance({ q: a.q, r: a.r }, { q: 2, r: 0 })).toBeGreaterThanOrEqual(start);
      }
    }
  });

  it('spawns a shield in an empty village a pirate is near', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.settlement = { owner: 1, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.unit = pirate('p1', 1, 0);
    const player = aiPlayer({
      skills: ['shields'],
      resources: { wood: 0, stone: 0, money: 100, ore: 3 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'spawn' && a.unitType === 'shield')).toBe(true);
  });

  it('skips bridge building while a naval threat is active', () => {
    const map = makeTestMap(6);
    // Two own land tiles with a water gap between them -> buildable bridge.
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 2, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    // Pirate elsewhere on the coast to create the threat.
    tileAt(map, 0, -3)!.terrain = TileType.Water;
    tileAt(map, 0, -3)!.unit = pirate('p1', 0, -3);
    tileAt(map, 0, 0)!.unit = makeUnit('w1', 1, 'warrior', 0, 0);
    const player = aiPlayer({
      skills: ['riding', 'bridges'],
      resources: { wood: 100, stone: 100, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'buildBridge')).toBe(false);
  });

  it('does not build a pointless bridge across a gap between two quiet own tiles when unthreatened', () => {
    const map = makeTestMap(6);
    tileAt(map, 0, 0)!.ownedBy = 1;
    tileAt(map, 2, 0)!.ownedBy = 1;
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    const player = aiPlayer({
      skills: ['riding', 'bridges'],
      resources: { wood: 100, stone: 100, money: 100, ore: 0 },
    });
    const actions = planAiActions(map, player, new SeededRandom(1), 'capture');
    expect(actions.some((a) => a.type === 'buildBridge')).toBe(false);
  });
});
