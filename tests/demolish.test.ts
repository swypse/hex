import { BuildingKind, CommandType, GameMode, UnitType } from '@enums';
import { describe, it, expect } from 'vitest';
import { makeTestMap, tileAt, makeUnit } from './helpers/test-map';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { TileType } from '../src/game/map/tile-types';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';
import { demolish, demolishKindAt } from '../src/game/economy/buildings';

function setup(): ReturnType<typeof makeTestMap> {
  return makeTestMap(2);
}

describe('demolishing', () => {
  it('destroys a mine or sawmill under the unit and spends the whole turn', () => {
    const map = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.building = { kind: BuildingKind.MINE, level: 1 } as never;
    const unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    tile.unit = unit;
    expect(demolishKindAt(tile, unit)).toBe(BuildingKind.MINE);
    expect(demolish(map, tile, unit, () => 0)).toMatchObject({ kind: BuildingKind.MINE, died: false });
    expect(tile.building).toBeNull();
    expect(unit.hasMoved && unit.hasAttacked && unit.hasHealed).toBe(true);
    expect(demolishKindAt(tile, unit)).toBeNull();
  });

  it('is unavailable after moving, attacking or healing', () => {
    const map = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.building = { kind: BuildingKind.SAWMILL, level: 1 } as never;
    const unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    tile.unit = unit;
    unit.hasHealed = true;
    expect(demolishKindAt(tile, unit)).toBeNull();
  });

  it('moves the unit off a destroyed bridge to a free adjacent land cell', () => {
    const map = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.terrain = TileType.Water;
    tile.bridge = { owner: 0 } as never;
    tile.roadOwner = 0;
    const unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    tile.unit = unit;
    const res = demolish(map, tile, unit, () => 0)!;
    expect(res.died).toBe(false);
    expect(tile.bridge).toBeNull();
    expect(tile.unit).toBeNull();
    expect(res.movedTo?.unit).toBe(unit);
    expect([unit.q, unit.r]).toEqual([res.movedTo!.q, res.movedTo!.r]);
  });

  it('kills the unit when no adjacent land cell is free', () => {
    const map = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.terrain = TileType.Water;
    tile.bridge = { owner: 0 } as never;
    const unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    tile.unit = unit;
    for (const t of map.tiles) if (t !== tile) t.terrain = TileType.Water;
    const res = demolish(map, tile, unit, () => 0)!;
    expect(res.died).toBe(true);
    expect(tile.unit).toBeNull();
  });

  it('runs through the simulator command', () => {
    const map = setup();
    const tile = tileAt(map, 1, 0)!;
    tile.building = { kind: BuildingKind.SAWMILL, level: 1 } as never;
    tile.unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    const sim = new Simulator(map, buildPlayers(Tribe.Villagers, 1, new SeededRandom(1)), GameMode.CAPTURE, { rng: () => 0.5 });
    sim.startGame();
    sim.currentPlayerIndex = 0;
    sim.drainEvents();
    expect(sim.applyCommand({ type: CommandType.DEMOLISH, unitId: 'u' })).toBe(true);
    expect(sim.drainEvents()).toContainEqual(expect.objectContaining({ type: 'demolished', kind: 'sawmill', died: false }));
    expect(sim.applyCommand({ type: CommandType.DEMOLISH, unitId: 'u' })).toBe(false);
  });
});
