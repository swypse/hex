import { buildPlayers } from '@/game/players';
import { Simulator } from '@/game/simulator';
import { TileType } from '@/game/map/tile-types';
import { Tribe } from '@/game/tribes';
import { type Unit } from '@/game/units/units';
import { SeededRandom } from '@/util';
import { BuilderBuildStatus, BuilderExtraKind, BuildingKind, CommandType, GameMode, UnitType } from '@enums';
import { builderBuildStatus } from '@/game/economy/buildings';
import { ROAD_COST } from '@/game/economy/roads';
import { beforeEach, describe, expect, it } from 'vitest';
import { giveResources, makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function freshVillagersSim() {
  const map = makeTestMap(3);
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  players[0]!.tribe = Tribe.Villagers;
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.5 });
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
  giveResources(sim.map, sim.players[0]!, { wood: 100, stone: 100, money: 100, ore: 100, food: 20 });
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
    const builder = place(0, UnitType.BUILDER, 0, 0);
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuildingKind.SAWMILL });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.building?.kind).toBe(BuildingKind.SAWMILL);
    expect(findUnit(builder.id).hasMoved).toBe(true);
    expect(findUnit(builder.id).hasAttacked).toBe(true);
  });

  it('cannot build farther than one hex', () => {
    tileAt(map, 3, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 3, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, UnitType.BUILDER, 0, 0);
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 3, r: 0, kind: BuildingKind.SAWMILL });
    expect(ok).toBe(false);
  });

  it('cannot build on a ship', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, UnitType.BUILDER, 0, 0);
    builder.shipLevel = 1;
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuildingKind.SAWMILL });
    expect(ok).toBe(false);
  });

  it('can build a bridge on a water tile between two own land shores', () => {
    tileAt(map, 1, 0)!.terrain = TileType.Water;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.ownedBy = 0; // opposite shore (land)
    const builder = place(0, UnitType.BUILDER, 0, 0);
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuilderExtraKind.BRIDGE });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.bridge).not.toBeNull();
    expect(tileAt(map, 1, 0)!.bridge!.owner).toBe(0);
    expect(findUnit(builder.id).hasMoved).toBe(true);
  });

  it('cannot build onto an unowned tile', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    const builder = place(0, UnitType.BUILDER, 0, 0);
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuildingKind.SAWMILL });
    expect(ok).toBe(false);
  });

  it('cannot build twice in one turn', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    tileAt(map, 0, 1)!.terrain = TileType.GrasslandLand;
    tileAt(map, 0, 1)!.ownedBy = 0;
    const builder = place(0, UnitType.BUILDER, 0, 0);
    expect(sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuildingKind.SAWMILL })).toBe(true);
    expect(sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 0, r: 1, kind: BuildingKind.SAWMILL })).toBe(false);
  });

  it('a regular tile build still requires its skill (no unitId)', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    // Villagers player has no Forestry skill
    const ok = sim.applyCommand({ type: CommandType.BUILD, q: 1, r: 0, kind: BuildingKind.SAWMILL });
    expect(ok).toBe(false);
  });
});

describe('builder roads', () => {
  // A village at (0,0) with its stock; the helper map has none of its own there.
  beforeEach(() => {
    const v = tileAt(map, 0, 0)!;
    v.settlement = { owner: 0, level: 1, captureReady: false, stock: { wood: 100, stone: 100, ore: 0, food: 20 } };
    v.ownedBy = 0;
  });

  const ownLand = (q: number, r: number): void => {
    const t = tileAt(map, q, r)!;
    t.terrain = TileType.GrasslandLand;
    t.ownedBy = 0;
    t.claimedByVillage = { q: 0, r: 0 };
  };

  it('builds a road next to a village without the Roads skill, paying the road cost', () => {
    ownLand(1, 0);
    const builder = place(0, UnitType.BUILDER, 0, 0);
    const before = sim.players[0]!.resources.money;
    const ok = sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuilderExtraKind.ROAD });
    expect(ok).toBe(true);
    expect(tileAt(map, 1, 0)!.roadOwner).toBe(0);
    expect(sim.players[0]!.resources.money).toBe(before - ROAD_COST.money);
    expect(findUnit(builder.id).hasMoved).toBe(true);
  });

  it('cannot build a road that does not join the road network or a village', () => {
    ownLand(-1, 0);
    ownLand(-2, 0);
    const builder = place(0, UnitType.BUILDER, -1, 0);
    // (-2,0) is adjacent to the builder but not to a village or a road.
    expect(sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: -2, r: 0, kind: BuilderExtraKind.ROAD })).toBe(false);
    expect(tileAt(map, -2, 0)!.roadOwner ?? null).toBeNull();
  });

  it('cannot afford a road without money', () => {
    ownLand(1, 0);
    const builder = place(0, UnitType.BUILDER, 0, 0);
    sim.players[0]!.resources.money = 0;
    expect(sim.applyCommand({ type: CommandType.BUILD, unitId: builder.id, q: 1, r: 0, kind: BuilderExtraKind.ROAD })).toBe(false);
    expect(builderBuildStatus(sim.map, tileAt(sim.map, 0, 0)!, BuilderExtraKind.ROAD, sim.players[0]!)).toBe(BuilderBuildStatus.CANNOT_AFFORD);
  });
});

describe('builderBuildStatus', () => {
  const statusFor = (kind: BuildingKind | BuilderExtraKind, at = { q: 0, r: 0 }) =>
    builderBuildStatus(sim.map, tileAt(sim.map, at.q, at.r)!, kind, sim.players[0]!);

  it('is NO_PLACE when no reachable cell passes the placement rules', () => {
    // No forest beside owned land: no sawmill spot. No water: no bridge spot.
    expect(statusFor(BuildingKind.SAWMILL)).toBe(BuilderBuildStatus.NO_PLACE);
    expect(statusFor(BuilderExtraKind.BRIDGE)).toBe(BuilderBuildStatus.NO_PLACE);
  });

  it('is AVAILABLE with a place and enough resources', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    expect(statusFor(BuildingKind.SAWMILL)).toBe(BuilderBuildStatus.AVAILABLE);
  });

  it('is CANNOT_AFFORD with a place but not enough resources', () => {
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandLand;
    tileAt(map, 1, 0)!.ownedBy = 0;
    tileAt(map, 2, 0)!.terrain = TileType.GrasslandForest;
    giveResources(sim.map, sim.players[0]!, { wood: 0, stone: 0, money: 0, ore: 0, food: 0 });
    sim.players[0]!.resources.money = 0;
    expect(statusFor(BuildingKind.SAWMILL)).toBe(BuilderBuildStatus.CANNOT_AFFORD);
  });
});
