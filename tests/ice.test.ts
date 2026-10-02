import { describe, it, expect } from 'vitest';
import { freezeCoast, thawIce, countIceTiles } from '../src/game/ice';
import { GameMap, MapTile } from '../src/game/map-gen';
import { TileType } from '../src/game/tile-types';
import { makeUnit } from '../src/game/units';
import { isShip } from '../src/game/ship';
import { tileMoveCost, TILE_MOVE_COST } from '../src/game/movement-cost';
import { reachableTargets } from '../src/game/selection';
import { canBuildRoadHere } from '../src/game/roads';
import { Simulator } from '../src/game/simulator';
import { seasonForTurn } from '../src/game/season';

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
    at(m, 1).building = { kind: 'port' } as MapTile['building'];
    expect(freezeCoast(m).frozen).toEqual([]);
    const m2 = strip();
    at(m2, 1).bridge = { dir: 'we' } as unknown as MapTile['bridge'];
    expect(freezeCoast(m2).frozen).toEqual([]);
  });

  it('lands a ship on freezing water as a land unit', () => {
    const m = strip();
    const ship = makeUnit(0, 'warrior', 1, 0, { shipLevel: 2 });
    at(m, 1).unit = ship;
    const r = freezeCoast(m);
    expect(r.landed).toEqual([{ unitId: ship.id, owner: 0 }]);
    expect(isShip(ship)).toBe(false);
    expect(at(m, 1).unit).toBe(ship);
  });

  it('makes a pirate ship on freezing water disappear', () => {
    const m = strip();
    at(m, 1).unit = makeUnit(-1, 'pirate', 1, 0, { shipLevel: 1 });
    const r = freezeCoast(m);
    expect(r.removed).toEqual([{ q: 1, r: 0 }]);
    expect(at(m, 1).unit).toBeNull();
  });

  it('leaves a ship on non-coast water alone', () => {
    const m = strip();
    const ship = makeUnit(0, 'warrior', 2, 0, { shipLevel: 1 });
    at(m, 2).unit = ship;
    freezeCoast(m);
    expect(isShip(ship)).toBe(true);
  });

  it('thaws ice back to water and kills units standing on it', () => {
    const m = strip();
    freezeCoast(m);
    const u = makeUnit(0, 'warrior', 1, 0);
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
    const u = makeUnit(0, 'warrior', 0, 0);
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
      [{ index: 0, tribe: 0, isHuman: false, name: 'a', resources: { wood: 0, stone: 0, money: 0, ore: 0, food: 20 }, score: 0, kills: 0, skills: [], isActive: true } as never],
      'turns30' as never,
      { disablePirates: true },
    );
    sim.turn = 18;
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.turn).toBe(19);
    expect(seasonForTurn(sim.turn)).toBe('winter');
    expect(at(m, 1).terrain).toBe(TileType.Ice);
    expect(sim.drainEvents().some((e) => e.type === 'seasonChanged')).toBe(true);
    sim.turn = 24;
    sim.applyCommand({ type: 'endTurn' });
    expect(at(m, 1).terrain).toBe(TileType.Water);
  });
});
