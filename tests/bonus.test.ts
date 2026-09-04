import { describe, expect, it } from 'vitest';
import { generateMap, type GameMap } from '../src/game/mapGen';
import { makeTestMap, tileAt, makeUnit } from './helpers/testMap';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { isWaterType, TileType } from '../src/game/tileTypes';
import { hexDistance, hexNeighbors } from '../src/game/hex';
import {
  bonusEligibleFor,
  explorerPath,
  findClosestVillage,
  randomBonusKind,
} from '../src/game/bonus';
import { isExploredFor } from '../src/game/explore';
import { SKILLS, type SkillId } from '../src/game/skills';

describe('bonus placement', () => {
  it('places players+1 bonuses on land with spacing constraints', () => {
    for (const seed of [1, 2, 3, 42]) {
      const map = generateMap(3, seed);
      const bonuses = map.tiles.filter((t) => t.bonus);
      expect(bonuses.length).toBe(4);
      for (const b of bonuses) {
        expect(b.settlement).toBeNull();
        expect(b.building).toBeNull();
        expect(isWaterType(b.terrain)).toBe(false);
        for (const spawn of map.spawns) {
          expect(hexDistance(b, spawn.start)).toBeGreaterThanOrEqual(4);
        }
      }
      for (let i = 0; i < bonuses.length; i++) {
        for (let j = i + 1; j < bonuses.length; j++) {
          expect(hexDistance(bonuses[i]!, bonuses[j]!)).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('randomBonusKind returns a known kind', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 100; i++) kinds.add(randomBonusKind(() => Math.random()));
    expect([...kinds].sort()).toEqual(['explorer', 'money', 'resources', 'skill', 'villageUpgrade']);
  });
});

describe('bonus helpers', () => {
  it('bonusEligibleFor requires a same-player unit and a previous arrival turn', () => {
    const map = makeTestMap(3);
    const t = tileAt(map, 1, 0)!;
    t.bonus = { kind: 'money', claimer: 0, arrivalTurn: 1 };
    expect(bonusEligibleFor(map, 0, 1)).toEqual([]);
    t.unit = makeUnit('u1', 0, 'warrior', 1, 0);
    expect(bonusEligibleFor(map, 0, 1)).toEqual([]);
    expect(bonusEligibleFor(map, 0, 2).length).toBe(1);
    // A different player's unit is not eligible.
    t.unit.owner = 1;
    expect(bonusEligibleFor(map, 0, 2)).toEqual([]);
  });

  it('explorerPath returns only land moves, at most 25', () => {
    const map = makeTestMap(3);
    const path = explorerPath(map, tileAt(map, 0, 0)!, () => 0.3);
    expect(path.length).toBeLessThanOrEqual(25);
    for (const step of path) {
      const t = tileAt(map, step.q, step.r)!;
      expect(isWaterType(t.terrain)).toBe(false);
      expect(t.unit).toBeNull();
    }
  });

  it('findClosestVillage picks the nearest owned village', () => {
    const map = makeTestMap(4);
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 4, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 3)!.settlement = { owner: 1, level: 1, captureReady: false };
    const closest = findClosestVillage(map, tileAt(map, 1, 1)!, 0);
    expect(closest).not.toBeNull();
    expect(closest!.q).toBe(0);
    expect(closest!.r).toBe(0);
  });

  it('explorerPath first steps onto an unexplored cell when one is adjacent', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [];
    tileAt(map, 0, 0)!.exploredBy = [0];
    for (const n of hexNeighbors(tileAt(map, 0, 0)!)) {
      const t = tileAt(map, n.q, n.r)!;
      t.exploredBy = [0];
    }
    // Only (1,0) remains unexplored among the start tile's neighbours.
    tileAt(map, 1, 0)!.exploredBy = [];
    for (let i = 0; i < 20; i++) {
      const path = explorerPath(map, tileAt(map, 0, 0)!, () => Math.random(), 0);
      expect(path[0]).toEqual({ q: 1, r: 0 });
    }
  });

  it('explorerPath steps onto an explored cell only when no unexplored neighbour exists', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [0];
    const path = explorerPath(map, tileAt(map, 0, 0)!, () => 0.9, 0);
    expect(path.length).toBeGreaterThan(0);
    expect(isExploredFor(tileAt(map, path[0]!.q, path[0]!.r)!, 0)).toBe(true);
  });

  it('explorerPath prefers a never-visited cell over a visited one even when both are in fog', () => {
    const map = corridorMap([[0, 0], [1, 0], [2, 0]]);
    for (let i = 0; i < 20; i++) {
      const path = explorerPath(map, tileAt(map, 0, 0)!, () => 0.9, 0);
      // At (1,0) the previously visited (0,0) and fresh (2,0) are both fog;
      // the explorer must step onto (2,0) instead of walking back.
      expect(path[0]).toEqual({ q: 1, r: 0 });
      expect(path[1]).toEqual({ q: 2, r: 0 });
    }
  });

  it('explorerPath revisits a visited cell only to escape a dead end', () => {
    const map = corridorMap([[0, 0], [1, 0], [2, 0]]);
    const path = explorerPath(map, tileAt(map, 0, 0)!, () => 0.3, 0);
    // (0,0) -> (1,0) -> (2,0) is a dead end; the explorer must step back onto
    // the already-visited (1,0) because no never-visited neighbour remains.
    expect(path[0]).toEqual({ q: 1, r: 0 });
    expect(path[1]).toEqual({ q: 2, r: 0 });
    expect(path[2]).toEqual({ q: 1, r: 0 });
  });
});

function corridorMap(cells: [number, number][]): GameMap {
  return {
    radius: 3,
    spawns: [],
    tiles: cells.map(([q, r]) => ({
      q,
      r,
      terrain: TileType.GrasslandLand,
      settlement: null,
      building: null,
      unit: null,
      ownedBy: null,
      claimedByVillage: null,
      exploredBy: [],
    })),
  };
}

function bonusMap(kind: 'money' | 'resources' | 'villageUpgrade' | 'explorer' | 'skill' = 'money') {
  const map = makeTestMap(3);
  for (const t of map.tiles) t.exploredBy = [];
  tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
  tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
  tileAt(map, 0, 0)!.exploredBy = [0];
  const target = tileAt(map, 0, 1)!;
  target.exploredBy = [0];
  target.bonus = { kind, claimer: null, arrivalTurn: 0 };
  return { map, target };
}

describe('bonus claiming (simulator)', () => {
  function makeSim(kind: 'money' | 'resources' | 'villageUpgrade' | 'explorer' | 'skill' = 'money', rng = 0.5) {
    const { map, target } = bonusMap(kind);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => rng });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 1 });
    return { map, target, players, sim };
  }

  it('requires waiting until the next turn, then awards and exhausts the unit', () => {
    const { map, target, players, sim } = makeSim('money');
    expect(target.bonus!.arrivalTurn).toBe(1);
    expect(bonusEligibleFor(map, 0, 1).length).toBe(0);
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(false);

    sim.applyCommand({ type: 'endTurn' });
    expect(sim.turn).toBe(2);
    expect(sim.currentPlayerIndex).toBe(0);
    expect(bonusEligibleFor(map, 0, 2).length).toBe(1);
    const before = players[0]!.resources.money;
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(target.bonus).toBeNull();
    expect(players[0]!.resources.money).toBe(before + 15);
    expect(target.unit!.hasMoved).toBe(true);
    expect(target.unit!.hasAttacked).toBe(true);
    expect(target.unit!.hasHealed).toBe(true);
  });

  it('resources bonus adds wood, stone, ore', () => {
    const { map, target, players, sim } = makeSim('resources');
    sim.applyCommand({ type: 'endTurn' });
    const wood = players[0]!.resources.wood;
    const stone = players[0]!.resources.stone;
    const ore = players[0]!.resources.ore;
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(players[0]!.resources.wood).toBe(wood + 10);
    expect(players[0]!.resources.stone).toBe(stone + 5);
    expect(players[0]!.resources.ore).toBe(ore + 5);
  });

  it('villageUpgrade bonus upgrades the closest village for free', () => {
    const { map, target, sim } = makeSim('villageUpgrade');
    const village = tileAt(map, 0, 0)!;
    expect(village.settlement!.level).toBe(1);
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(village.settlement!.level).toBe(2);
    expect(target.bonus).toBeNull();
  });

  it('explorer bonus reveals tiles and emits an explorer event', () => {
    const { map, target, sim } = makeSim('explorer', 0.3);
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'explorer')).toBe(true);
    const explored = map.tiles.filter((t) => isExploredFor(t, 0)).length;
    expect(explored).toBeGreaterThan(2);
    expect(target.bonus).toBeNull();
  });

  it('skill bonus opens a random unopened skill for the claimer', () => {
    const { map, target, players, sim } = makeSim('skill', 0); // rng 0 -> first unopened = climbing
    sim.applyCommand({ type: 'endTurn' });
    expect(players[0]!.skills).not.toContain('climbing');
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(players[0]!.skills).toContain('climbing');
    expect(target.bonus).toBeNull();
    const events = sim.drainEvents();
    const claim = events.find((e) => e.type === 'bonusClaimed');
    expect(claim).toMatchObject({ type: 'bonusClaimed', kind: 'skill', skill: 'climbing', playerIndex: 0 });
  });

  it('skill bonus falls back to +15 money when all skills are open', () => {
    const map = makeTestMap(3);
    for (const t of map.tiles) t.exploredBy = [];
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
    tileAt(map, 0, 0)!.exploredBy = [0];
    const target = tileAt(map, 0, 1)!;
    target.exploredBy = [0];
    target.bonus = { kind: 'skill', claimer: null, arrivalTurn: 0 };
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[0]!.skills = Object.keys(SKILLS) as SkillId[];
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 1 });
    sim.applyCommand({ type: 'endTurn' });
    const moneyBefore = players[0]!.resources.money;
    expect(sim.applyCommand({ type: 'claimBonus' })).toBe(true);
    expect(players[0]!.resources.money).toBe(moneyBefore + 15);
    const events = sim.drainEvents();
    expect(events.find((e) => e.type === 'bonusClaimed')).toMatchObject({ kind: 'money', playerIndex: 0 });
  });

  it('AI players claim eligible bonuses on their turn', () => {
    const map = makeTestMap(3);
    tileAt(map, 0, 0)!.settlement = { owner: 0, level: 1, captureReady: false };
    tileAt(map, 0, 0)!.unit = makeUnit('u0', 0, 'warrior', 0, 0);
    const aiTile = tileAt(map, 3, 0)!;
    aiTile.unit = makeUnit('ai1', 1, 'warrior', 3, 0);
    aiTile.bonus = { kind: 'money', claimer: 1, arrivalTurn: 1 };
    // Surround the AI unit with water so its planner cannot move it away.
    for (const n of hexNeighbors(aiTile)) {
      const t = tileAt(map, n.q, n.r);
      if (t) t.terrain = TileType.Water;
    }
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    // Human ends turn 1 -> AI turn 1 plays -> wrap -> human turn 2.
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.turn).toBe(2);
    expect(sim.currentPlayerIndex).toBe(0);
    // Human ends turn 2 -> AI turn 2 plays (claims bonus) -> wrap -> human turn 3.
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.turn).toBe(3);
    expect(sim.currentPlayerIndex).toBe(0);
    expect(aiTile.bonus).toBeNull();
    const events = sim.drainEvents();
    expect(events.some((e) => e.type === 'bonusClaimed' && e.playerIndex === 1)).toBe(true);
  });
});
