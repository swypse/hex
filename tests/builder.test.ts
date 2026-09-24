import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { Simulator } from '../src/game/simulator';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { TileType } from '../src/game/tile-types';
import { Unit } from '../src/game/units';

function freshVillagersSim() {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Villagers;
  const sim = new Simulator(map, players, 'turns30', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  return { map, players, sim };
}

let sim: Simulator;
let map: ReturnType<typeof makeTestMap>;

beforeEach(() => {
  const s = freshVillagersSim();
  sim = s.sim;
  map = s.map;
  sim.players[0]!.resources = { wood: 100, stone: 100, money: 100, ore: 100 };
});

function place(owner: number, type: Unit['type'], q: number, r: number, opts: Partial<Unit> = {}): Unit {
  const u = makeUnit('b' + Math.random().toString(36).slice(2, 8), owner, type, q, r);
  Object.assign(u, opts);
  tileAt(map, q, r)!.unit = u;
  return u;
}

function findUnit(id: string): Unit {
  return sim.map.tiles.find((t) => t.unit?.id === id)!.unit!;
}

describe('builder', () => {
  it('builds a sawmill on an adjacent owned tile without the Forestry skill', () => {
    // builder (Villagers player has no skills); owned land at (1,0) next to a forest at (2,0)
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, 'builder', 0, 0);
    const ok = sim.applyCommand({ type: 'build', unitId: builder.id, q: 1, r: 0, kind: 'sawmill' });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.building?.kind).toBe('sawmill');
    expect(findUnit(builder.id).hasMoved).toBe(true);
    expect(findUnit(builder.id).hasAttacked).toBe(true);
  });

  it('cannot build farther than one hex', () => {
    tileAt(map, 3, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 3, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, 'builder', 0, 0);
    const ok = sim.applyCommand({ type: 'build', unitId: builder.id, q: 3, r: 0, kind: 'sawmill' });
    expect(ok).toBe(false);
  });

  it('cannot build on a ship', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, 'builder', 0, 0);
    builder.shipLevel = 1;
    const ok = sim.applyCommand({ type: 'build', unitId: builder.id, q: 1, r: 0, kind: 'sawmill' });
    expect(ok).toBe(false);
  });

  it('can build a bridge on a water tile between two own land shores', () => {
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.ownedBy = 0; // opposite shore (land)
    const builder = place(0, 'builder', 0, 0);
    const ok = sim.applyCommand({ type: 'build', unitId: builder.id, q: 1, r: 0, kind: 'bridge' });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.bridge).not.toBeNull();
    expect(tileAt(map, 1, 0)!.bridge!.owner).toBe(0);
    expect(findUnit(builder.id).hasMoved).toBe(true);
  });

  it('cannot build onto an unowned tile', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, 'builder', 0, 0);
    const ok = sim.applyCommand({ type: 'build', unitId: builder.id, q: 1, r: 0, kind: 'sawmill' });
    expect(ok).toBe(false);
  });

  it('cannot build twice in one turn', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    tileAt(map, 0, 1)!.terrain = TileType.GrasslandLand;
    tileAt(map, 0, 1)!.ownedBy = 0;
    const builder = place(0, 'builder', 0, 0);
    expect(sim.applyCommand({ type: 'build', unitId: builder.id, q: 1, r: 0, kind: 'sawmill' })).toBe(true);
    expect(sim.applyCommand({ type: 'build', unitId: builder.id, q: 0, r: 1, kind: 'sawmill' })).toBe(false);
  });

  it('a regular tile build still requires its skill (no unitId)', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    // Villagers player has no Forestry skill
    const ok = sim.applyCommand({ type: 'build', q: 1, r: 0, kind: 'sawmill' });
    expect(ok).toBe(false);
  });
});