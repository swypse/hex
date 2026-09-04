import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { planAiActions } from '../src/game/ai';
import { AiAction } from '../src/game/aiTypes';
import { reachableTargets } from '../src/game/selection';
import { TileType } from '../src/game/tileTypes';
import { Tribe } from '../src/game/tribes';
import { Unit } from '../src/game/units';
import { SeededRandom } from '../src/util/random';
import { SKILLS, type SkillId } from '../src/game/skills';

function makeTile(
  q: number,
  r: number,
  ownedBy: number | null = null,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain: TileType.GrasslandLand, settlement, unit, ownedBy, claimedByVillage: null, building: null, exploredBy: [0, 1] };
}

function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 50, attack: 20, attackDistance: 1, defence: 0, spawnVillage: null };
}

function makeRider(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'rider', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp: 40, attack: 20, attackDistance: 1, defence: 5, spawnVillage: null };
}

function aiPlayer(): import('../src/game/players').Player {
  return {
    index: 1, tribe: Tribe.Villagers, isHuman: false, name: 'AI',
    resources: { wood: 5, stone: 5, money: 100, ore: 5 },
    score: 0, kills: 0, skills: [], isActive: true,
  };
}

function makeAiMap(): GameMap {
  const village = makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false });
  const warrior = makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('w1', 1, 0, 0));
  const target = makeTile(1, 0, null);
  return { radius: 4, tiles: [village, warrior, target], spawns: [] };
}

function planSeeds(map: GameMap, player: import('../src/game/players').Player, seeds: number): AiAction[] {
  const all: AiAction[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    all.push(...planAiActions(map, player, new SeededRandom(seed)));
  }
  return all;
}

describe('planAiActions', () => {
  it('returns a bounded list of actions', () => {
    const actions = planAiActions(makeAiMap(), aiPlayer(), new SeededRandom(1));
    expect(Array.isArray(actions)).toBe(true);
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.length).toBeLessThan(200);
  });

  it('accepts an explicit game mode and still plans', () => {
    const actions = planAiActions(makeAiMap(), aiPlayer(), new SeededRandom(1), 'capture');
    expect(Array.isArray(actions)).toBe(true);
  });

  it('moves only to reachable tiles', () => {
    const map = makeAiMap();
    const unit = map.tiles.find((t) => t.unit)!.unit!;
    const reachable = new Set(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`));
    for (const a of planSeeds(map, aiPlayer(), 10)) {
      if (a.type === 'move') expect(reachable.has(`${a.q},${a.r}`)).toBe(true);
    }
  });

  it('does not plan moves for other players units', () => {
    for (const a of planSeeds(makeAiMap(), aiPlayer(), 10)) {
      if (a.type === 'move') expect(a.unitId).toBe('w1');
    }
  });

  it('spawns and upgrades across seeds', () => {
    const all = planSeeds(makeAiMap(), aiPlayer(), 40);
    expect(all.some((a) => a.type === 'spawn')).toBe(true);
    expect(all.some((a) => a.type === 'upgrade')).toBe(true);
  });

  it('plans a capture when parked on a capture-ready foreign village', () => {
    const map = makeAiMap();
    map.tiles[0]!.settlement!.owner = 0;
    map.tiles[0]!.settlement!.captureReady = true;
    map.tiles[0]!.unit = makeWarrior('ai1', 1, 0, 0);
    expect(planSeeds(map, aiPlayer(), 40).some((a) => a.type === 'capture')).toBe(true);
  });

  it('plans an attack when an enemy is adjacent', () => {
    const map = makeAiMap();
    map.tiles.push(makeTile(0, 1, 0, null, makeWarrior('enemy', 0, 0, 1)));
    expect(planSeeds(map, aiPlayer(), 40).some((a) => a.type === 'attack')).toBe(true);
  });

  it('chains a move then an attack when moving brings the unit in range', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, null, null, makeWarrior('ai1', 1, 0, 0)),
      makeTile(1, 0),
      makeTile(2, 0, 0, null, makeWarrior('enemy', 0, 2, 0)),
    );
    const actions = planAiActions(map, aiPlayer(), new SeededRandom(1));
    const move = actions.find((a) => a.type === 'move');
    const attack = actions.find((a) => a.type === 'attack');
    expect(move).toBeDefined();
    expect(attack).toBeDefined();
    expect(actions.indexOf(move!) < actions.indexOf(attack!)).toBe(true);
  });

  it('does not move a unit out of its village when an enemy is near', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('w1', 1, 0, 0)),
      makeTile(1, 0),
      makeTile(2, 0),
      makeTile(3, 0, 0, null, makeRider('enemy', 0, 3, 0)),
    );
    const actions = planAiActions(map, aiPlayer(), new SeededRandom(1));
    expect(actions.some((a) => a.type === 'move')).toBe(false);
  });

  it('sends a unit to capture a reachable free village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('w1', 1, 0, 0)),
      makeTile(1, 0, null, { owner: null, level: 1, captureReady: false }),
      makeTile(2, 0),
    );
    const actions = planAiActions(map, aiPlayer(), new SeededRandom(1));
    const move = actions.find((a) => a.type === 'move');
    expect(move).toBeDefined();
    if (move && move.type === 'move') {
      expect(move.q).toBe(1);
      expect(move.r).toBe(0);
    }
  });

  it('spawns the best affordable unit type', () => {
    const map = makeAiMap();
    const player = { ...aiPlayer(), skills: ['swordsman'] as import('../src/game/players').Player['skills'] };
    const spawns = planSeeds(map, player, 40).filter((a) => a.type === 'spawn');
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      if (s.type === 'spawn') expect(s.unitType).toBe('swordsman');
    }
  });

  it('spawns a shield for defense when a village is threatened', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }),
      makeTile(1, 0),
      makeTile(2, 0, 0, null, makeRider('enemy', 0, 2, 0)),
    );
    const player = { ...aiPlayer(), resources: { wood: 5, stone: 5, money: 10, ore: 3 } };
    const spawns = planSeeds(map, player, 40).filter((a) => a.type === 'spawn');
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      if (s.type === 'spawn') expect(s.unitType).toBe('shield');
    }
  });

  it('spawns a rider to reach a distant free village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }),
      makeTile(1, 0),
      makeTile(5, 0, null, { owner: null, level: 1, captureReady: false }),
    );
    const player = { ...aiPlayer(), resources: { wood: 5, stone: 5, money: 10, ore: 0 }, skills: ['riding'] as import('../src/game/players').Player['skills'] };
    const spawns = planSeeds(map, player, 40).filter((a) => a.type === 'spawn');
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      if (s.type === 'spawn') expect(s.unitType).toBe('rider');
    }
  });

  it('marches toward the enemy village front in war stance', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    map.tiles.push(
      makeTile(0, 0, 1, { owner: 1, level: 1, captureReady: false }, makeWarrior('g1', 1, 0, 0)),
      makeTile(0, 1, null, null, makeWarrior('g2', 1, 0, 1)),
      makeTile(0, -1, null, null, makeWarrior('g3', 1, 0, -1)),
      makeTile(1, 0),
      makeTile(2, 0),
      makeTile(3, 0),
      makeTile(4, 0),
      makeTile(5, 0, 0, { owner: 0, level: 1, captureReady: false }),
    );
    const all = planSeeds(map, aiPlayer(), 20);
    const moves = all.filter((a) => a.type === 'move');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((m) => m.type === 'move' && m.q > 0)).toBe(true);
  });
});

describe('AI bridge building', () => {
  it('plans a bridge over a water gap when it has the skill and owns a shore', () => {
    const tiles = [makeTile(0, 0, 1), makeTile(1, 0, null), makeTile(2, 0, 1)];
    tiles[1]!.terrain = TileType.Water;
    const map: GameMap = { radius: 4, tiles, spawns: [] };
    const p = aiPlayer();
    p.skills = Object.keys(SKILLS) as SkillId[];
    p.resources = { wood: 100, stone: 100, money: 100, ore: 0 };
    const actions = planAiActions(map, p, new SeededRandom(1));
    expect(actions.some((a) => a.type === 'buildBridge')).toBe(true);
  });
});
