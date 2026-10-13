import { describe, expect, it } from 'vitest';
import { AiActionType, BuildingKind, SkillId, SpawnPreference, UnitType } from '@enums';
import { migrateLegacyResources } from '../src/game/economy/stock';
import { type GameMap } from '../src/game/map/map-gen';
import { type Player } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { attackDamage, isPoorTrapperTarget, chooseBestAttack } from '../src/game/units/combat';
import { AI_PATTERNS, type AiPatternContext, attackersForTile, bestSpawnableUnitType, spawnWouldBeKilled } from '../src/game/ai/ai-patterns';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const AI = 1;

function aiPlayer(skills: Player['skills'] = [], flags: Player['aiFlags'] = undefined): Player {
  return {
    index: AI, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 20, stone: 20, money: 100, ore: 10, food: 20 },
    score: 0, kills: 0, skills, isActive: true, aiFlags: flags,
  } as Player;
}

function freshState(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

function ctx(map: GameMap, player: Player): AiPatternContext {
  migrateLegacyResources(map, [player]);
  return { map, player, rng: new SeededRandom(1), state: freshState() };
}

const pattern = (id: string) => AI_PATTERNS.find((p) => p.id === id)!;

function put(map: GameMap, owner: number, type: UnitType, q: number, r: number, hp?: number) {
  const u = makeUnit(`${type}-${owner}-${q},${r}`, owner, type, q, r);
  if (hp !== undefined) u.hp = hp;
  tileAt(map, q, r)!.unit = u;
  return u;
}

/** AI village at (-3,0) so its units are not garrisons on enemy ground. */
function baseMap(): GameMap {
  const map = makeTestMap(5);
  const v = tileAt(map, -4, 0)!;
  v.settlement = { owner: AI, level: 1, captureReady: false, capital: true };
  v.ownedBy = AI;
  return map;
}

describe('enemy trapper', () => {
  it('is a poor target for melee that cannot kill it, not for ranged or finishers', () => {
    const trapper = makeUnit('t', 0, UnitType.TRAPPER, 0, 0);
    expect(isPoorTrapperTarget(makeUnit('w', 1, UnitType.WARRIOR, 1, 0), trapper)).toBe(true);
    expect(isPoorTrapperTarget(makeUnit('a', 1, UnitType.ARCHER, 2, 0), trapper)).toBe(false);
    expect(isPoorTrapperTarget(makeUnit('c', 1, UnitType.CATAPULT, 3, 0), trapper)).toBe(false);
    const weak = makeUnit('t2', 0, UnitType.TRAPPER, 0, 0);
    weak.hp = 5;
    expect(isPoorTrapperTarget(makeUnit('w', 1, UnitType.WARRIOR, 1, 0), weak)).toBe(false);
    // other enemy types are unaffected
    expect(isPoorTrapperTarget(makeUnit('w', 1, UnitType.WARRIOR, 1, 0), makeUnit('x', 0, UnitType.WARRIOR, 0, 0))).toBe(false);
  });

  it('chooseBestAttack leaves a healthy trapper to ranged units', () => {
    const map = baseMap();
    put(map, 0, UnitType.TRAPPER, 0, 0);
    const warrior = put(map, AI, UnitType.WARRIOR, 1, 0);
    const archer = put(map, AI, UnitType.ARCHER, 2, 0);
    expect(chooseBestAttack(map, warrior, AI)).toBeNull();
    expect(chooseBestAttack(map, archer, AI)).toBe(tileAt(map, 0, 0));
  });

  it('gang-ups use ranged units and add melee only as the finisher', () => {
    const map = baseMap();
    const trapperTile = tileAt(map, 0, 0)!;
    put(map, 0, UnitType.TRAPPER, 0, 0);
    const warrior = put(map, AI, UnitType.WARRIOR, 1, 0);
    const p = aiPlayer();
    // A lone warrior cannot finish a healthy trapper: not sent.
    expect(attackersForTile(map, p, trapperTile, freshState())).toEqual([]);

    const archer = put(map, AI, UnitType.ARCHER, 2, 0);
    const combined = attackDamage(archer) + attackDamage(warrior);
    // The archer alone cannot kill it, and the warrior would not finish it.
    trapperTile.unit!.hp = combined + 1;
    expect(attackersForTile(map, p, trapperTile, freshState()).map((a) => a.unit.type)).toEqual([UnitType.ARCHER]);
    // When archer + warrior together kill it, the warrior joins, after the archer.
    trapperTile.unit!.hp = combined;
    expect(attackersForTile(map, p, trapperTile, freshState()).map((a) => a.unit.type)).toEqual([UnitType.ARCHER, UnitType.WARRIOR]);
  });
});

describe('spawning into an empty own village', () => {
  function villageMap(): { map: GameMap; v: ReturnType<typeof tileAt> } {
    const map = makeTestMap(5);
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: AI, level: 1, captureReady: false, capital: true };
    v.ownedBy = AI;
    return { map, v };
  }

  it('is not safe when enemies in reach can kill the new unit in one turn', () => {
    const { map, v } = villageMap();
    for (const [q, r] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) put(map, 0, UnitType.KNIGHT, q, r);
    expect(spawnWouldBeKilled(map, v!, AI, UnitType.WARRIOR)).toBe(true);
  });

  it('is safe with no enemy in reach (an archer far away does not count)', () => {
    const { map, v } = villageMap();
    put(map, 0, UnitType.WARRIOR, 5, 0);
    expect(spawnWouldBeKilled(map, v!, AI, UnitType.WARRIOR)).toBe(false);
  });

  it('counts a catapult at range but not a warrior two moves away', () => {
    const { map, v } = villageMap();
    put(map, 0, UnitType.WARRIOR, 3, 0); // warrior reach is 2 hexes: out of range
    expect(spawnWouldBeKilled(map, v!, AI, UnitType.SHIELD)).toBe(false);
    for (const [q, r] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, -2], [-2, 2]] as const) put(map, 0, UnitType.CATAPULT, q, r);
    expect(spawnWouldBeKilled(map, v!, AI, UnitType.WARRIOR)).toBe(true);
  });

  it('bestSpawnableUnitType skips rejected types and defend-empty-village does not spawn a doomed unit', () => {
    const { map, v } = villageMap();
    const p = aiPlayer([SkillId.SHIELDS]);
    migrateLegacyResources(map, [p]);
    // Surround with enough damage that any spawn dies.
    for (const [q, r] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const) put(map, 0, UnitType.KNIGHT, q, r);
    expect(bestSpawnableUnitType(p, SpawnPreference.DEFENSE, map, v!)).not.toBeNull();
    expect(bestSpawnableUnitType(p, SpawnPreference.DEFENSE, map, v!, () => false)).toBeNull();
    const actions = pattern('defend-empty-village').evaluate({ map, player: p, rng: new SeededRandom(1), state: freshState() });
    // Every candidate type dies to six knights, so nothing is raised.
    expect(actions).toBeNull();
  });
});

describe('raid-enemy-buildings', () => {
  function enemyBuildings(map: GameMap, kinds: [BuildingKind, number, number][]): void {
    for (const [kind, q, r] of kinds) {
      const t = tileAt(map, q, r)!;
      t.ownedBy = 0;
      t.building = { kind, level: 1 };
    }
  }

  it('a catapult sieges the granary before a sawmill, moving into range first', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.SAWMILL, 1, 0], [BuildingKind.GRANARY, 0, 1]]);
    const cat = put(map, AI, UnitType.CATAPULT, -5, 1); // one step out of its range of 4
    const p = aiPlayer();
    const actions = pattern('raid-enemy-buildings').evaluate(ctx(map, p))!;
    expect(actions[actions.length - 1]).toMatchObject({ type: AiActionType.ATTACK, unitId: cat.id, q: 0, r: 1 });
    expect(actions[0]).toMatchObject({ type: AiActionType.MOVE, unitId: cat.id });
  });

  it('prefers university > farm > mine > sawmill', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.MINE, 1, 0], [BuildingKind.FARM, 0, 1], [BuildingKind.UNIVERSITY, -1, 1], [BuildingKind.SAWMILL, 1, -1]]);
    put(map, AI, UnitType.CATAPULT, -2, 0);
    const actions = pattern('raid-enemy-buildings').evaluate(ctx(map, aiPlayer()))!;
    expect(actions[actions.length - 1]).toMatchObject({ type: AiActionType.ATTACK, q: -1, r: 1 });
  });

  it('a warrior walks onto an enemy farm and burns it', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.FARM, 0, 0]]);
    const w = put(map, AI, UnitType.WARRIOR, -1, 0);
    const actions = pattern('raid-enemy-buildings').evaluate(ctx(map, aiPlayer()))!;
    expect(actions).toEqual([
      { type: AiActionType.MOVE, unitId: w.id, q: 0, r: 0 },
      { type: AiActionType.BURN, unitId: w.id },
    ]);
  });

  it('a warrior cannot destroy a mine (only catapults can)', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.MINE, 0, 0]]);
    put(map, AI, UnitType.WARRIOR, -1, 0);
    expect(pattern('raid-enemy-buildings').evaluate(ctx(map, aiPlayer()))).toBeNull();
  });

  it('does nothing when the flag is off', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.FARM, 0, 0]]);
    put(map, AI, UnitType.WARRIOR, -1, 0);
    expect(pattern('raid-enemy-buildings').evaluate(ctx(map, aiPlayer([], { raidBuildings: false })))).toBeNull();
  });

  it('skips a tile the enemies are likely to kill the raider on', () => {
    const map = baseMap();
    enemyBuildings(map, [[BuildingKind.FARM, 0, 0]]);
    put(map, AI, UnitType.WARRIOR, -1, 0);
    for (const [q, r] of [[1, 0], [0, 1], [1, -1]] as const) put(map, 0, UnitType.KNIGHT, q, r);
    expect(pattern('raid-enemy-buildings').evaluate(ctx(map, aiPlayer()))).toBeNull();
  });
});
