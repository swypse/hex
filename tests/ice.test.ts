import { countIceTiles, freezeCoast, thawIce } from '@/game/map/ice';
import { type GameMap, type MapTile } from '@/game/map/map-gen';
import { TILE_MOVE_COST, tileMoveCost } from '@/game/units/movement-cost';
import { canBuildRoadHere } from '@/game/economy/roads';
import { seasonForTurn } from '@/game/season';
import { reachableTargets } from '@/game/units/selection';
import { isShip } from '@/game/units/ship';
import { Simulator } from '@/game/simulator';
import { TileType } from '@/game/map/tile-types';
import { makeUnit } from '@/game/units/units';
import { BuildingKind, CommandType, GameEventType, GameMode, Season, UnitType } from '@enums';
import { describe, expect, it } from 'vitest';

function tile(q: number, r: number, terrain: TileType): MapTile {
  return { q, r, terrain, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null };
}

/** Row r=0: land(0) water(1) water(2) water(3); the sea at q>=2 is not on the coast. */
function strip(): GameMap {
  return {
    radius: 4,
    spawns: [],
    tiles: [
      tile(0, 0, TileType.GrasslandLand),
      tile(1, 0, TileType.Water),
      tile(2, 0, TileType.Water),
      tile(3, 0, TileType.Water),
    ],
  };
}

const at = (m: GameMap, q: number) => m.tiles.find((t) => t.q === q)!;

describe('freezeCoast / thawIce', () => {
  it('freezes only water that touches land', () => {
    const m = strip();
    const r = freezeCoast(m);
    expect(r.frozen).toEqual([{ q: 1, r: 0 }]);
    expect(at(m, 1).terrain).toBe(TileType.Ice);
    expect(at(m, 2).terrain).toBe(TileType.Water);
    expect(countIceTiles(m)).toBe(1);
  });

  it('does not freeze water with a port or a bridge', () => {
    const m = strip();
    at(m, 1).building = { kind: BuildingKind.PORT } as MapTile['building'];
    expect(freezeCoast(m).frozen).toEqual([]);
    const m2 = strip();
    at(m2, 1).bridge = { dir: 'we' } as unknown as MapTile['bridge'];
    expect(freezeCoast(m2).frozen).toEqual([]);
  });

  it('lands a ship on freezing water as a land unit', () => {
    const m = strip();
    const ship = makeUnit(0, UnitType.WARRIOR, 1, 0, { shipLevel: 2 });
    at(m, 1).unit = ship;
    const r = freezeCoast(m);
    expect(r.landed).toEqual([{ unitId: ship.id, owner: 0 }]);
    expect(isShip(ship)).toBe(false);
    expect(at(m, 1).unit).toBe(ship);
  });

  it('makes a pirate ship on freezing water disappear', () => {
    const m = strip();
    at(m, 1).unit = makeUnit(-1, UnitType.PIRATE, 1, 0, { shipLevel: 1 });
    const r = freezeCoast(m);
    expect(r.removed).toEqual([{ q: 1, r: 0 }]);
    expect(at(m, 1).unit).toBeNull();
  });

  it('leaves a ship on non-coast water alone', () => {
    const m = strip();
    const ship = makeUnit(0, UnitType.WARRIOR, 2, 0, { shipLevel: 1 });
    at(m, 2).unit = ship;
    freezeCoast(m);
    expect(isShip(ship)).toBe(true);
  });

  it('thaws ice back to water and kills units standing on it', () => {
    const m = strip();
    freezeCoast(m);
    const u = makeUnit(0, UnitType.WARRIOR, 1, 0);
    at(m, 1).unit = u;
    const r = thawIce(m);
    expect(r.thawed).toEqual([{ q: 1, r: 0 }]);
    expect(r.killed).toEqual([{ unitId: u.id, q: 1, r: 0, owner: 0 }]);
    expect(at(m, 1).terrain).toBe(TileType.Water);
    expect(at(m, 1).unit).toBeNull();
  });
});

describe('ice as ground', () => {
  it('costs like land to leave', () => {
    const m = strip();
    freezeCoast(m);
    expect(tileMoveCost(m, at(m, 1), 0)).toBe(TILE_MOVE_COST.land);
  });

  it('lets a land unit walk onto it', () => {
    const m = strip();
    freezeCoast(m);
    const u = makeUnit(0, UnitType.WARRIOR, 0, 0);
    at(m, 0).unit = u;
    (at(m, 0) as MapTile).exploredBy = [0];
    for (const t of m.tiles) t.exploredBy = [0];
    const reach = reachableTargets(m, u, 30, false, false, 0);
    expect(reach.some((t) => t.q === 1)).toBe(true);
    expect(reach.some((t) => t.q === 2)).toBe(false);
  });

  it('cannot carry a road', () => {
    const m = strip();
    freezeCoast(m);
    expect(canBuildRoadHere(m, at(m, 1), { index: 0 } as never)).toBe(false);
  });
});

describe('season transitions in the simulator', () => {
  it('freezes on entering winter (turn 19) and thaws on entering spring (turn 25)', () => {
    const m = strip();
    const sim = new Simulator(
      m,
      [{
        index: 0,
        tribe: 0,
        isHuman: false,
        name: 'a',
        resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 },
        score: 0,
        kills: 0,
        skills: [],
        isActive: true
      } as never],
      GameMode.TURNS30 as never,
      { disablePirates: true },
    );
    sim.turn = 18;
    sim.applyCommand({ type: CommandType.END_TURN });
    expect(sim.turn).toBe(19);
    expect(seasonForTurn(sim.turn)).toBe(Season.WINTER);
    expect(at(m, 1).terrain).toBe(TileType.Ice);
    expect(sim.drainEvents().some((e) => e.type === GameEventType.SEASON_CHANGED)).toBe(true);
    sim.turn = 24;
    sim.applyCommand({ type: CommandType.END_TURN });
    expect(at(m, 1).terrain).toBe(TileType.Water);
  });

  it('forceSeason jumps forward to the next such season, freezing and thawing', () => {
    const m = strip();
    const sim = new Simulator(
      m,
      [{
        index: 0,
        tribe: 0,
        isHuman: false,
        name: 'a',
        resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 },
        score: 0,
        kills: 0,
        skills: [],
        isActive: true
      } as never],
      GameMode.TURNS30 as never,
      { disablePirates: true },
    );
    expect(sim.forceSeason(Season.SPRING)).toBe(false);
    expect(sim.forceSeason(Season.WINTER)).toBe(true);
    expect(sim.turn).toBe(19);
    expect(at(m, 1).terrain).toBe(TileType.Ice);
    expect(sim.drainEvents().some((e) => e.type === GameEventType.SEASON_CHANGED && e.frozen.length === 1)).toBe(true);
    expect(sim.forceSeason(Season.SUMMER)).toBe(true);
    expect(sim.turn).toBe(31);
    expect(seasonForTurn(sim.turn)).toBe(Season.SUMMER);
    expect(at(m, 1).terrain).toBe(TileType.Water);
    expect(sim.drainEvents().some((e) => e.type === GameEventType.SEASON_CHANGED && e.thawed.length === 1)).toBe(true);
  });
});
