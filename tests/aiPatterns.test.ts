import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Player } from '../src/game/players';
import { Unit } from '../src/game/units';
import { SeededRandom } from '../src/util/random';
import { AI_PATTERNS, AiPatternContext, bestSpawnableUnitType, enemyCanAttackNext, enemyCanReach, nearestEnemyDistanceFrom } from '../src/game/aiPatterns';
import { AiPlannerState } from '../src/game/aiTypes';
import { analyzeSituation } from '../src/game/aiSituation';
import { AI_DIFFICULTY_PROFILES } from '../src/game/aiDifficulty';
import { GameMode } from '../src/game/gameMode';

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
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 20, attackDistance: 1, defence: 0, spawnVillage: null };
}

function archer(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'archer', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 30, attack: 20, attackDistance: 2, defence: 5, spawnVillage: null };
}

function rider(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'rider', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, defence: 5, spawnVillage: null };
}

function player(money: number, skills: Player['skills'] = []): Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money, ore: 5 },
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
  return { map, player, rng, state: state() };
}

function situCtx(map: GameMap, player: Player, mode: GameMode = 'capture') {
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
    const actions = findPattern('defend-empty-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe('spawn');
    if (actions![0]!.type === 'spawn') expect(actions![0]!.unitType).toBe('shield');
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
    expect(actions![0]).toMatchObject({ type: 'move', unitId: 'defender', q: 0, r: 0 });
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
      expect(actions![0]!.type).toBe('heal');
    } else {
      expect(actions!.length).toBe(2);
      expect(actions![0]!.type).toBe('move');
      expect(actions![1]!.type).toBe('spawn');
    }
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
    expect(actions![0]!.type).toBe('move');
    if (actions![0]!.type === 'move') {
      expect(actions![0]!.q).toBe(0);
      expect(actions![0]!.r).toBe(-1);
    }
    expect(actions![1]!.type).toBe('attack');
    if (actions![1]!.type === 'attack') {
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
    expect(actions!.some((a) => a.type === 'attack')).toBe(true);
  });

  it('attack-enemy-in-village moves a farther unit adjacent then attacks', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = tile(0, 0, { owner: 1, level: 1, captureReady: false }, warrior('enemy', 0, 0, 0), 1);
    map.tiles.push(village, tile(1, 0), tile(2, 0, null, warrior('ai1', 1, 2, 0)));
    const actions = findPattern('attack-enemy-in-village').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    const move = actions!.find((a) => a.type === 'move');
    const attack = actions!.find((a) => a.type === 'attack');
    expect(move).toBeDefined();
    expect(attack).toBeDefined();
    if (move && move.type === 'move') {
      expect(move.q).toBe(1);
      expect(move.r).toBe(0);
    }
    if (attack && attack.type === 'attack') {
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
    expect(actions!.filter((a) => a.type === 'attack').length).toBe(2);
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
    expect(actions![0]!.type).toBe('move');
    if (actions![0]!.type === 'move') {
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
    expect(actions![0]!.type).toBe('move');
    if (actions![0]!.type === 'move') {
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
    expect(actions![0]!.type).toBe('move');
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
    expect(actions![0]!.type).toBe('move');
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
    expect(actions![0]!.type).toBe('move');
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
    expect(actions!.filter((a) => a.type === 'attack').length).toBe(2);
    for (const a of actions!) {
      if (a.type === 'attack') {
        expect(a.q).toBe(1);
        expect(a.r).toBe(0);
      }
    }
  });

  it('collect-bonus walks the closest idle unit onto an explored bonus tile', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)));
    const goal = tile(1, 0);
    goal.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
    map.tiles.push(goal);
    const actions = findPattern('collect-bonus').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]).toMatchObject({ type: 'move', unitId: 'ai1', q: 1, r: 0 });
  });

  it('collect-bonus ignores bonuses hidden in fog', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(tile(0, 0, null, warrior('ai1', 1, 0, 0)));
    const goal = tile(1, 0);
    goal.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
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
    goal.bonus = { kind: 'money', claimer: null, arrivalTurn: 0 };
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
    const actions = findPattern('economy-opening').evaluate(ctx(map, player(100), new SeededRandom(1)));
    expect(actions).not.toBeNull();
    expect(actions![0]!.type).toBe('upgrade');
  });

  it('bestSpawnableUnitType offers catapult only with the skill and resources', () => {
    const rich = player(100);
    rich.resources.wood = 20;
    rich.resources.ore = 5;
    expect(bestSpawnableUnitType(rich, 'offense')).not.toBe('catapult');
    const skilled = player(100, ['catapult']);
    skilled.resources.wood = 20;
    skilled.resources.ore = 5;
    expect(bestSpawnableUnitType(skilled, 'offense')).toBe('catapult');
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
    expect(actions![0]!.type).toBe('move');
    if (actions![0]!.type === 'move') {
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
    expect(actions![0]!.type).toBe('move');
    if (actions![0]!.type === 'move') {
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
    expect(actions!.some((a) => a.type === 'attack')).toBe(true);
  });
});
