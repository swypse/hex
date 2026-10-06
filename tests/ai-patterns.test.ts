import { describe, it, expect } from 'vitest';
import { type GameMap, type MapTile, type Settlement } from '../src/game/map/map-gen';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { type Player } from '../src/game/players';
import { type Unit } from '../src/game/units/units';
import { SeededRandom } from '../src/util/random';
import { migrateLegacyResources } from '../src/game/economy/stock';
import { AI_PATTERNS, type AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, guardGarrisonAttack, nearestEnemyDistanceFrom } from '../src/game/ai/ai-patterns';
import { type AiPlannerState } from '../src/game/ai/ai-types';
import { analyzeSituation } from '../src/game/ai/ai-situation';
import { AI_DIFFICULTY_PROFILES } from '../src/game/ai/ai-difficulty';
import { TRIBE_SPECIAL_UNIT } from '../src/game/tribes';
import { makeTestMap, tileAt } from './helpers/test-map';
import { AiActionType, AiStance, BonusKind, GameMode, GarrisonGuardKind, SkillId, SpawnPreference, UnitType } from '@enums';

function tile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
  ownedBy: number | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function warrior(id: string, owner: number, q: number, r: number, hp = 50): Unit {
  return { id, owner, type: UnitType.WARRIOR, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 20, attackDistance: 1, defense: 10, spawnVillage: null };
}

function archer(id: string, owner: number, q: number, r: number, hp = 40): Unit {
  return { id, owner, type: UnitType.ARCHER, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 20, attackDistance: 2, defense: 7, spawnVillage: null };
}

function rider(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: UnitType.RIDER, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, defense: 7, spawnVillage: null };
}

function knight(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: UnitType.KNIGHT, q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 60, attack: 40, attackDistance: 1, defense: 7, spawnVillage: null };
}

function player(money: number, skills: Player['skills'] = []): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money, ore: 5, food: 20 },
    score: 0, kills: 0, skills, isActive: true,
  };
}

function state(): AiPlannerState {
  return {
    moved: new Set(), acted: new Set(), upgraded: new Set(), spawned: new Set(),
    built: new Set(), opened: new Set(), occupied: new Set(),
  };
}

function ctx(map: GameMap, player: Player, rng: SeededRandom): AiPatternContext {
  // The player's literal wood/stone/ore/food sit in its capital, like a loaded game.
  migrateLegacyResources(map, [player]);
  return { map, player, rng, state: state() };
}

function situCtx(map: GameMap, player: Player, mode: GameMode = GameMode.CAPTURE) {
  const base = ctx(map, player, new SeededRandom(1));
  return {
    ...base,
    situation: analyzeSituation(map, player, mode, AI_DIFFICULTY_PROFILES.normal),
    difficulty: AI_DIFFICULTY_PROFILES.normal,
  };
}

function findPattern(id: string) {
  return AI_PATTERNS.find((p) => p.id === id)!;
}

describe('AI patterns', () => {
  it('are sorted by priority descending', () => {
    for (let i = 1; i < AI_PATTERNS.length; i++) {
      expect(AI_PATTERNS[i]!.priority).toBeLessThanOrEqual(AI_PATTERNS[i - 1]!.priority);
    }
  });

  it('defend-empty-village spawns a defensive shield on a threatened empty village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false, capital: true }, null, 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)));
    const actions = findPattern('defend-empty-village').evaluate(ctx(map, player(100, [SkillId.SHIELDS]), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.SPAWN);
    if (actions![0]!.type === AiActionType.SPAWN) expect(actions![0]!.unitType).toBe(UnitType.SHIELD);
  });

  it('defend-empty-village returns null when not threatened', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1), tile(3, 0, null, warrior('enemy', 0, 3, 0)));
    expect(findPattern('defend-empty-village').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('garrison-empty-village moves the closest unit to an empty threatened village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, 1, null, warrior('defender', 1, 0, 1)),
    );
    const actions = findPattern('garrison-empty-village').evaluate(ctx(map, player(0), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatchObject({ type: AiActionType.MOVE, unitId: 'defender', q: 0, r: 0 });
  });

  it('garrison-empty-village returns null when no unit can reach the village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(5, 0, null, warrior('defender', 1, 5, 0)),
    );
    expect(findPattern('garrison-empty-village').evaluate(ctx(map, player(0), new SeededRandom(1)))).toBeNull();
  });

  it('defend-hurt-unit heals or moves out + spawns a threatened hurt unit on its village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 2), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)), tile(0, 1));
    const actions = findPattern('defend-hurt-unit').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    if (actions!.length === 1) {
      expect(actions![0]!.type).toBe(AiActionType.HEAL);
    } else {
      expect(actions!.length).toBe(2);
      expect(actions![0]!.type).toBe(AiActionType.MOVE);
      expect(actions![1]!.type).toBe(AiActionType.SPAWN);
    }
  });

  it('defend-hurt-unit heals a threatened garrison when healing restores it to full', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 35), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)));
    const actions = findPattern('defend-hurt-unit').evaluate(ctx(map, player(0), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatchObject({ type: AiActionType.HEAL, unitId: 'w', q: 0, r: 0 });
  });

  it('defend-hurt-unit pulls out a weak garrison and spawns a fresh defender when affordable', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 5), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)), tile(0, 1));
    const actions = findPattern('defend-hurt-unit').evaluate(ctx(map, player(100, [SkillId.SHIELDS]), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.length).toBe(2);
    expect(actions![0]).toMatchObject({ type: AiActionType.MOVE, unitId: 'w' });
    expect(actions![1]).toMatchObject({ type: AiActionType.SPAWN, q: 0, r: 0, unitType: UnitType.SHIELD });
  });

  it('defend-hurt-unit keeps and heals a low-hp garrison when it cannot afford a replacement', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 5), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)), tile(0, 1));
    const actions = findPattern('defend-hurt-unit').evaluate(ctx(map, player(0), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatchObject({ type: AiActionType.HEAL, unitId: 'w', q: 0, r: 0 });
  });

  it('defend-hurt-unit leaves a healthy threatened garrison alone', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0, 50), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('enemy', 0, 1, 0)));
    expect(findPattern('defend-hurt-unit').evaluate(ctx(map, player(0), new SeededRandom(1)))).toBeNull();
  });

  it('archer-kite moves to distance 2 then attacks a distance-1 enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, archer('a', 1, 0, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, -1),
    );
    const actions = findPattern('archer-kite').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.length).toBe(2);
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
    if (actions![0]!.type === AiActionType.MOVE) {
      expect(actions![0]!.q).toBe(0);
      expect(actions![0]!.r).toBe(-1);
    }
    expect(actions![1]!.type).toBe(AiActionType.ATTACK);
    if (actions![1]!.type === AiActionType.ATTACK) {
      expect(actions![1]!.q).toBe(1);
      expect(actions![1]!.r).toBe(0);
    }
  });

  it('attack-enemy-in-village directs units to attack an enemy standing on the ai village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('enemy', 0, 0, 0), 1);
    map.tiles.push(village, tile(1, 0, null, warrior('ai1', 1, 1, 0)));
    const actions = findPattern('attack-enemy-in-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.some((a) => a.type === AiActionType.ATTACK)).toBe(true);
  });

  it('attack-enemy-in-village moves a farther unit adjacent then attacks', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('enemy', 0, 0, 0), 1);
    map.tiles.push(village, tile(1, 0), tile(2, 0, null, warrior('ai1', 1, 2, 0)));
    const actions = findPattern('attack-enemy-in-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    const move = actions!.find((a) => a.type === AiActionType.MOVE);
    const attack = actions!.find((a) => a.type === AiActionType.ATTACK);
    expect(move).toBeDefined();
    expect(attack).toBeDefined();
    if (move && move.type === AiActionType.MOVE) {
      expect(move.q).toBe(1);
      expect(move.r).toBe(0);
    }
    if (attack && attack.type === AiActionType.ATTACK) {
      expect(attack.q).toBe(0);
      expect(attack.r).toBe(0);
    }
  });

  it('attack-enemy-in-village returns null when no enemy is in an ai village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('w', 1, 0, 0), 1),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
    );
    expect(findPattern('attack-enemy-in-village').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('focus-fire directs two attackers at a killable target', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(2, 0, null, warrior('ai2', 1, 2, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0, 1)),
    );
    const actions = findPattern('focus-fire').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.filter((a) => a.type === AiActionType.ATTACK).length).toBe(2);
  });

  it('capture-push parks a unit on a nearby enemy village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0, { owner: 0, level: 1, captureReady: false }, null, 0),
      tile(2, 0),
    );
    const actions = findPattern('capture-push').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
    if (actions![0]!.type === AiActionType.MOVE) {
      expect(actions![0]!.q).toBe(1);
      expect(actions![0]!.r).toBe(0);
    }
  });

  it('capture-free-village sends a unit to a reachable free village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0, { owner: null, level: 1, captureReady: false }, null),
      tile(2, 0),
    );
    const actions = findPattern('capture-free-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
    if (actions![0]!.type === AiActionType.MOVE) {
      expect(actions![0]!.q).toBe(1);
      expect(actions![0]!.r).toBe(0);
    }
  });

  it('capture-free-village returns null when no free village is reachable', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(3, 0, { owner: null, level: 1, captureReady: false }, null),
    );
    expect(findPattern('capture-free-village').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('explore-frontier moves a unit onto a tile bordering unexplored territory', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0),
    );
    const fog = tile(2, 0);
    fog.exploredBy = [0];
    map.tiles.push(fog);
    const actions = findPattern('explore-frontier').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
  });

  it('counter-threat retreats a unit an enemy can kill', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0, 1)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, 1),
    );
    const actions = findPattern('counter-threat').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
  });

  it('retreat-heal pulls a wounded threatened unit back', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0, 2)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
      tile(0, 1),
      tile(1, -1),
    );
    const actions = findPattern('retreat-heal').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
  });

  it('enemyCanReach ignores enemies hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1);
    const enemy = tile(1, 0, null, warrior('enemy', 0, 1, 0));
    enemy.exploredBy = [0];
    map.tiles.push(village, enemy);
    expect(enemyCanReach(map, village, 1)).toBe(false);
    enemy.exploredBy = [0, 1];
    expect(enemyCanReach(map, village, 1)).toBe(true);
  });

  it('enemyCanAttackNext ignores enemies hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1);
    const enemy = tile(2, 0, null, warrior('enemy', 0, 2, 0));
    enemy.exploredBy = [0];
    map.tiles.push(village, enemy);
    expect(enemyCanAttackNext(map, village, 1)).toBe(false);
    enemy.exploredBy = [0, 1];
    expect(enemyCanAttackNext(map, village, 1)).toBe(true);
  });

  it('nearestEnemyDistanceFrom ignores enemies hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = tile(3, 0, null, warrior('enemy', 0, 3, 0));
    enemy.exploredBy = [0];
    map.tiles.push(tile(0, 0), enemy);
    expect(nearestEnemyDistanceFrom(map, 1, map.tiles[0]!)).toBe(Infinity);
    enemy.exploredBy = [0, 1];
    expect(nearestEnemyDistanceFrom(map, 1, map.tiles[0]!)).toBe(3);
  });

  it('focus-fire ignores enemies hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(2, 0, null, warrior('ai2', 1, 2, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0, 1)),
    );
    const enemy = map.tiles[2]!;
    enemy.exploredBy = [0];
    expect(findPattern('focus-fire').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
    enemy.exploredBy = [0, 1];
    expect(findPattern('focus-fire').evaluate(ctx(map, player(100), new SeededRandom(1)))).not.toBeNull();
  });

  it('focus-fire gangs up even when the combined damage cannot kill', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(2, 0, null, warrior('ai2', 1, 2, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0, 10)),
    );
    const actions = findPattern('focus-fire').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.filter((a) => a.type === AiActionType.ATTACK).length).toBe(2);
    for (const a of actions!) {
      if (a.type === AiActionType.ATTACK) {
        expect(a.q).toBe(1);
        expect(a.r).toBe(0);
      }
    }
  });

  it('collect-bonus walks the closest idle unit onto an explored bonus tile', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)));
    const goal = tile(1, 0);
    goal.bonus = { kind: BonusKind.MONEY, claimer: null, arrivalTurn: 0 };
    map.tiles.push(goal);
    const actions = findPattern('collect-bonus').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatchObject({ type: AiActionType.MOVE, unitId: 'ai1', q: 1, r: 0 });
  });

  it('collect-bonus ignores bonuses hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)));
    const goal = tile(1, 0);
    goal.bonus = { kind: BonusKind.MONEY, claimer: null, arrivalTurn: 0 };
    goal.exploredBy = [0];
    map.tiles.push(goal);
    expect(findPattern('collect-bonus').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('collect-bonus leaves a unit alone when it can move into an attack', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)));
    map.tiles.push(tile(1, 0));
    map.tiles.push(tile(2, 0, null, warrior('enemy', 0, 2, 0)));
    const goal = tile(4, 0);
    goal.bonus = { kind: BonusKind.MONEY, claimer: null, arrivalTurn: 0 };
    map.tiles.push(goal);
    expect(findPattern('collect-bonus').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('counter-threat ignores enemies hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const enemy = tile(1, 0, null, warrior('enemy', 0, 1, 0));
    enemy.exploredBy = [0];
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0, 1)), enemy, tile(0, 1));
    expect(findPattern('counter-threat').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('economy-opening upgrades a village when the AI is small', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('ai1', 1, 1, 0)),
    );
    const small = player(100);
    small.resources.wood = 10; // enough left for a farm after the upgrade
    const actions = findPattern('economy-opening').evaluate(ctx(map, small, new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.UPGRADE);
  });

  it('economy-opening keeps the wood and stone of the first farm', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('ai1', 1, 1, 0)),
    );
    const poor = player(100); // wood 5: an upgrade (2 wood) would leave less than a farm needs
    expect(findPattern('economy-opening').evaluate(ctx(map, poor, new SeededRandom(1)))?.[0]?.type).not.toBe(AiActionType.UPGRADE);
  });

  it('bestSpawnableUnitType offers catapult only with the skill and resources', () => {
    const villageMap = (): { map: GameMap; village: MapTile } => {
      const village = tile(0, 0, { owner: 1, level: 1, captureReady: false, stock: { wood: 20, stone: 5, ore: 5, food: 20 } }, null, 1);
      return { map: { radius: 4, tiles: [village], spawns: [] }, village };
    };
    const noSkill = villageMap();
    expect(bestSpawnableUnitType(player(100), SpawnPreference.OFFENSE, noSkill.map, noSkill.village)).not.toBe(UnitType.CATAPULT);
    const skilled = villageMap();
    expect(bestSpawnableUnitType(player(100, [SkillId.CATAPULT]), SpawnPreference.OFFENSE, skilled.map, skilled.village)).toBe(UnitType.CATAPULT);
    // The village's own wood and ore decide: an empty village cannot afford it.
    const broke = villageMap();
    broke.village.settlement!.stock = { wood: 0, stone: 0, ore: 0, food: 20 };
    expect(bestSpawnableUnitType(player(100, [SkillId.CATAPULT]), SpawnPreference.OFFENSE, broke.map, broke.village)).not.toBe(UnitType.CATAPULT);
  });

  it('reinforce-endangered-village sends the closest unit to an endangered empty village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('ai1', 1, 1, 0)),
      tile(5, 0, null, rider('enemy', 0, 5, 0)), // reaches the village in 2 turns (movement 4, distance 5) <= guard 2
    );
    const actions = findPattern('reinforce-endangered-village').evaluate(situCtx(map, player(100)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
    if (actions![0]!.type === AiActionType.MOVE) {
      expect(actions![0]!.unitId).toBe('ai1');
      expect(actions![0]!.q).toBe(0);
      expect(actions![0]!.r).toBe(0);
    }
  });

  it('reinforce-endangered-village does nothing when no enemy threatens the village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
      tile(1, 0, null, warrior('ai1', 1, 1, 0)),
    );
    expect(findPattern('reinforce-endangered-village').evaluate(situCtx(map, player(100)))).toBeNull();
  });

  it('hunt-idle-enemy sends a melee unit toward a visible enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0),
      tile(2, 0),
      tile(3, 0, null, warrior('enemy', 0, 3, 0)),
    );
    const actions = findPattern('hunt-idle-enemy').evaluate(situCtx(map, player(100)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe(AiActionType.MOVE);
    if (actions![0]!.type === AiActionType.MOVE) {
      expect(actions![0]!.q).toBe(1);
      expect(actions![0]!.r).toBe(0);
    }
  });

  it('hunt-idle-enemy returns null when no enemy is visible', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)), tile(1, 0));
    expect(findPattern('hunt-idle-enemy').evaluate(situCtx(map, player(100)))).toBeNull();
  });

  it('hunt-idle-enemy attacks a killable enemy in range', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, warrior('ai1', 1, 0, 0)),
      tile(1, 0, null, warrior('enemy', 0, 1, 0, 5)),
    );
    const actions = findPattern('hunt-idle-enemy').evaluate(situCtx(map, player(100)));
    expect(actions).not.toBeNull();
    expect(actions!.some((a) => a.type === AiActionType.ATTACK)).toBe(true);
  });

  it('guardGarrisonAttack holds a garrison that would die to the counter with no replacement funds', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const garrison = { ...archer('g', 1, 0, 0, 5), spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, garrison, 1),
      tile(1, 0, null, knight('enemy', 0, 1, 0)),
    );
    const result = guardGarrisonAttack(map, player(0), garrison, map.tiles[1]!);
    expect(result.kind).toBe(GarrisonGuardKind.HOLD);
  });

  it('guardGarrisonAttack allows the attack and demands a spawn when the AI can afford a replacement', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const garrison = { ...archer('g', 1, 0, 0, 5), spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, garrison, 1),
      tile(1, 0, null, knight('enemy', 0, 1, 0)),
    );
    const result = guardGarrisonAttack(map, player(100), garrison, map.tiles[1]!);
    expect(result.kind).toBe(GarrisonGuardKind.ATTACK);
    if (result.kind === GarrisonGuardKind.ATTACK) expect(result.guardType).toBe(UnitType.ARCHER);
  });

  it('guardGarrisonAttack leaves a garrison free to attack when the counter cannot kill it', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const garrison = { ...archer('g', 1, 0, 0), spawnVillage: { q: 0, r: 0 } };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, garrison, 1),
      tile(1, 0, null, warrior('enemy', 0, 1, 0)),
    );
    const result = guardGarrisonAttack(map, player(0), garrison, map.tiles[1]!);
    expect(result.kind).toBe(GarrisonGuardKind.ATTACK);
    if (result.kind === GarrisonGuardKind.ATTACK) expect(result.guardType).toBeUndefined();
  });

  it('guardGarrisonAttack ignores units not standing on their own village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const unit = archer('a', 1, 2, 0);
    map.tiles.push(tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1), tile(2, 0, null, unit), tile(1, 0, null, knight('enemy', 0, 1, 0)));
    const result = guardGarrisonAttack(map, player(0), unit, map.tiles[2]!);
    expect(result.kind).toBe(GarrisonGuardKind.ATTACK);
  });

  it('attack-enemy-in-village does not empty the defending units own village', () => {
    // An enemy swordsman sits on the AI's village A. The only other AI unit is
    // a wounded warrior parked on its own village B next to the swordsman: it can
    // attack, but the swordsman's counter kills it and empties village B. With
    // no money to respawn a guard, the AI must hold instead.
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const garrison = { ...warrior('g', 1, 1, 0, 5), spawnVillage: { q: 1, r: 0 } };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, knight('enemy', 0, 0, 0), 1),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, garrison, 1),
    );
    const actions = findPattern('attack-enemy-in-village').evaluate(ctx(map, player(0), new SeededRandom(1)));
    expect(actions === null || !actions.some((a) => a.type === AiActionType.ATTACK && a.unitId === 'g')).toBe(true);
  });

  it('attack-enemy-in-village lets a garrison attack when it can respawn a guard', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const garrison = { ...warrior('g', 1, 1, 0, 5), spawnVillage: { q: 1, r: 0 } };
    map.tiles.push(
      tile(0, 0, { owner: 1, level: 1, captureReady: false }, knight('enemy', 0, 0, 0), 1),
      tile(1, 0, { owner: 1, level: 1, captureReady: false }, garrison, 1),
    );
    const actions = findPattern('attack-enemy-in-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions!.some((a) => a.type === AiActionType.SPAWN && a.q === 1 && a.r === 0)).toBe(true);
  });

  it('bestSpawnableUnitType never returns another tribe\'s special unit', () => {
    const cats = { ...player(100), tribe: Tribe.Cats };
    for (const prefer of [SpawnPreference.OFFENSE, SpawnPreference.DEFENSE, SpawnPreference.SCOUT, SpawnPreference.NAVAL]) {
      const type = bestSpawnableUnitType(cats, prefer);
      expect(type).not.toBe(UnitType.BUILDER);
      expect(type).not.toBe(UnitType.BANNER);
      expect(type).not.toBe(UnitType.BERSERKER);
      expect(type).not.toBe(UnitType.TRAPPER);
      expect(type).not.toBe(UnitType.STORMCALLER);
      expect(type).not.toBe(UnitType.STUNNER);
    }
    expect(TRIBE_SPECIAL_UNIT[Tribe.Cats]).toBe(UnitType.STALKER);
  });

  it('stalker-restealth hides an idle visible stalker near an enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const stalker = tile(0, 0, null, {
      id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 60, attack: 30, attackDistance: 1, spawnVillage: null,
    });
    map.tiles.push(stalker, tile(2, 0, null, warrior('enemy', 0, 2, 0)));
    const actions = findPattern('stalker-restealth').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'enableStealth', unitId: 'st' }]);
  });

  it('stalker-restealth does not hide a stalker far from the enemy', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, {
      id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 60, attack: 30, attackDistance: 1, spawnVillage: null,
    }), tile(9, 0, null, warrior('enemy', 0, 9, 0)));
    expect(findPattern('stalker-restealth').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('stalker-restealth does not hide an already hidden stalker', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, {
      id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false,
      hp: 60, attack: 30, attackDistance: 1, spawnVillage: null, isStealthed: true,
    }), tile(2, 0, null, warrior('enemy', 0, 2, 0)));
    expect(findPattern('stalker-restealth').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('special-unit-abilities storms a stormcaller with an enemy ship on village waters', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(-1, 0, { owner: 1, level: 1, captureReady: false }, null, 1), // village claim
      tile(0, 0, null, { id: 'sc', owner: 1, type: UnitType.STORMCALLER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, spawnVillage: null }, 1),
      tile(1, 0, null, { id: 'enemy', owner: 0, type: UnitType.WARRIOR, q: 1, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, spawnVillage: null, shipLevel: 1 }, 1),
    );
    // (1,0) claimed by village at (-1,0)? No — a village claims its own claim
    // circle; mark the two tiles as claimed by (-1,0) so stormTargetShips binds.
    map.tiles[1]!.claimedByVillage = { q: -1, r: 0 };
    map.tiles[2]!.claimedByVillage = { q: -1, r: 0 };
    map.tiles[1]!.terrain = TileType.GrasslandLand;
    map.tiles[2]!.terrain = TileType.Water;
    const actions = findPattern('special-unit-abilities').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'storm', unitId: 'sc' }]);
  });
});

describe('AI special unit patterns', () => {
  it('stunner-prefer-stun stuns a range-2 enemy instead of attacking', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'su', owner: 1, type: UnitType.STUNNER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 2, spawnVillage: null }),
      tile(1, 0, null, warrior('adjacent', 0, 1, 0)),
      tile(2, 0, null, warrior('far', 0, 2, 0)),
    );
    const actions = findPattern('stunner-prefer-stun').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'stun', unitId: 'su', q: 2, r: 0 }]);
  });

  it('stunner-prefer-stun returns nothing when no enemy sits at range 2', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'su', owner: 1, type: UnitType.STUNNER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 2, spawnVillage: null }),
      tile(1, 0, null, warrior('adjacent', 0, 1, 0)),
    );
    expect(findPattern('stunner-prefer-stun').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('stalker-scout attacks only when it can kill an enemy standing in a village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 20, attack: 10, attackDistance: 1, spawnVillage: null }),
      tile(1, 0, { owner: 0, level: 1, captureReady: false }, warrior('guard', 0, 1, 0, 5), 0),
    );
    const actions = findPattern('stalker-scout').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'attack', unitId: 'st', q: 1, r: 0 }]);
  });

  it('stalker-scout never attacks a village guard it cannot kill', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 20, attack: 10, attackDistance: 1, spawnVillage: null }),
      tile(1, 0, { owner: 0, level: 1, captureReady: false }, warrior('guard', 0, 1, 0, 50), 0),
    );
    expect(findPattern('stalker-scout').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('stalker-scout moves onto a free village to claim it', () => {
    const map = makeTestMap(4);
    tileAt(map, 0, 0)!.unit = { id: 'st', owner: 1, type: UnitType.STALKER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 20, attack: 10, attackDistance: 1, spawnVillage: null };
    tileAt(map, 2, 0)!.settlement = { owner: null, level: 1, captureReady: false };
    const actions = findPattern('stalker-scout').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'move', unitId: 'st', q: 2, r: 0 }]);
  });

  it('banner-position holds still when it already covers two friendly units', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'bn', owner: 1, type: UnitType.BANNER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, spawnVillage: null }),
      tile(0, 1, null, warrior('f1', 1, 0, 1)),
      tile(1, 0, null, warrior('f2', 1, 1, 0)),
    );
    expect(findPattern('banner-position').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('builder-work builds an adjacent mine without the smithery skill', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, { id: 'bd', owner: 1, type: UnitType.BUILDER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 10, attackDistance: 1, spawnVillage: null }, 1);
    village.claimedByVillage = { q: 0, r: 0 };
    const mountain = tile(1, 0, null, null, 1);
    mountain.terrain = TileType.GrasslandMountain;
    mountain.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, mountain);
    const actions = findPattern('builder-work').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'builderBuild', unitId: 'bd', q: 1, r: 0, kind: 'mine' }]);
  });

  it('trapper-lay plants a trap on an owned frontier cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      tile(0, 0, null, { id: 'tp', owner: 1, type: UnitType.TRAPPER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, spawnVillage: null }, 1),
      tile(1, 0, null, null, 1),
      // A village of the AI pays the trap's ore.
      tile(3, 0, { owner: 1, level: 1, captureReady: false }, null, 1),
    );
    map.tiles[1]!.exploredBy = []; // (1,0) unexplored → (0,0) is a frontier cell.
    const actions = findPattern('trapper-lay').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'trap', unitId: 'tp', q: 0, r: 0 }]);
  });

  it('spawn-special-unit spawns a Villagers builder when a mine needs building without smithery', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1);
    village.claimedByVillage = { q: 0, r: 0 };
    const mountain = tile(1, 0, null, null, 1);
    mountain.terrain = TileType.GrasslandMountain;
    mountain.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, mountain);
    const actions = findPattern('spawn-special-unit').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).toEqual([{ type: 'spawn', q: 0, r: 0, unitType: 'builder' }]);
  });

  it('spawn-special-unit does not spawn a second copy of the special unit', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, { id: 'bd', owner: 1, type: UnitType.BUILDER, q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 10, attackDistance: 1, spawnVillage: null }, 1);
    village.claimedByVillage = { q: 0, r: 0 };
    const mountain = tile(1, 0, null, null, 1);
    mountain.terrain = TileType.GrasslandMountain;
    mountain.claimedByVillage = { q: 0, r: 0 };
    map.tiles.push(village, mountain);
    expect(findPattern('spawn-special-unit').evaluate(ctx(map, player(100), new SeededRandom(1)))).toBeNull();
  });

  it('spawn-special-unit spawns an Aqua stormcaller under a naval threat', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, { owner: 1, level: 1, captureReady: false }, null, 1));
    const situation = {
      stance: AiStance.DEFEND, enemies: [], dangers: [], endangered: true, frontTarget: null,
      freeVillages: [], ownPower: 1, enemyPower: 1, navalThreat: true, navalEnemies: [], nearestNaval: null,
    };
    const aqua = { ...player(100), tribe: Tribe.Aqua };
    migrateLegacyResources(map, [aqua]);
    const context = { map, player: aqua, rng: new SeededRandom(1), state: state(), situation };
    const actions = findPattern('spawn-special-unit').evaluate(context);
    expect(actions).toEqual([{ type: 'spawn', q: 0, r: 0, unitType: 'stormcaller' }]);
  });
});
