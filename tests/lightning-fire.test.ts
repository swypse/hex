import { describe, expect, it } from 'vitest';
import { BuildingKind, CommandType, GameEventType, GameMode, UnitType, WeatherType } from '@enums';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import { applyFireTurn, applyLightning, extinguishCells } from '../src/game/weather/fire';
import { createWeather, isLightningTurn, spawnLightning, WEATHER_RULES } from '../src/game/weather/weather';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

const strike = (map: ReturnType<typeof makeTestMap>, q: number, r: number, rng: () => number) => {
  const event = createWeather(map, WeatherType.LIGHTNING, 9, () => 0)!;
  event.q = q;
  event.r = r;
  return applyLightning(map, event, rng);
};

describe('lightning schedule', () => {
  it('is attempted every 2nd turn from the first turn', () => {
    expect([8, 9, 10, 11, 13].map(isLightningTurn)).toEqual([false, true, false, true, true]);
  });

  it('fires with a 15% chance and lasts one turn', () => {
    const map = makeTestMap(4);
    expect(spawnLightning(map, 10, () => 0)).toBeNull();
    expect(spawnLightning(map, 9, () => 0.9)).toBeNull();
    const event = spawnLightning(map, 9, () => 0.1)!;
    expect(event.type).toBe(WeatherType.LIGHTNING);
    expect(event.lifetime).toBe(1);
    expect(event.radius).toBe(0);
  });
});

describe('lightning strike', () => {
  it('sets a forest on fire with 80% chance', () => {
    const map = makeTestMap(3);
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandForest;
    strike(map, 1, 0, () => 0.99);
    expect(tileAt(map, 1, 0)!.fire).toBeFalsy();
    strike(map, 1, 0, () => 0.79);
    expect(tileAt(map, 1, 0)!.fire).toEqual({ age: 0 });
  });

  it('damages a unit 40-60 and always ignites a building', () => {
    const map = makeTestMap(3);
    const tile = tileAt(map, 1, 0)!;
    tile.building = { kind: BuildingKind.FARM, level: 1 };
    tile.unit = makeUnit('u', 0, UnitType.WARRIOR, 1, 0);
    const before = tile.unit.hp;
    const report = strike(map, 1, 0, () => 0);
    expect(tile.fire).toEqual({ age: 0 });
    expect(report.units[0]!.damage).toBe(40);
    expect(before - tile.unit.hp).toBe(40);
    const hi = strike(map, 1, 0, () => 0.999);
    expect(hi.units[0]!.damage).toBe(60);
  });
});

describe('fire turn', () => {
  it('burns a forest for 3 rounds, hurting the unit on it, then leaves land of its biome', () => {
    const map = makeTestMap(3);
    const tile = tileAt(map, 0, 0)!;
    tile.terrain = TileType.GrasslandForest;
    tile.fire = { age: 0 };
    tile.unit = makeUnit('u', 0, UnitType.WARRIOR, 0, 0);
    const hp = tile.unit.hp;
    applyFireTurn(map, () => 0.99);
    applyFireTurn(map, () => 0.99);
    expect(tile.terrain).toBe(TileType.GrasslandForest);
    expect(hp - tile.unit.hp).toBe(20);
    const last = applyFireTurn(map, () => 0.99);
    expect(tile.terrain).toBe(TileType.GrasslandLand);
    expect(tile.fire).toBeNull();
    expect(last.burnedOut).toEqual([{ q: 0, r: 0 }]);
  });

  it('burns a building for 1 damage a round until it is destroyed', () => {
    const map = makeTestMap(3);
    const tile = tileAt(map, 0, 0)!;
    tile.building = { kind: BuildingKind.SAWMILL, level: 1 };
    tile.fire = { age: 0 };
    applyFireTurn(map, () => 0.99);
    expect(tile.building!.hp).toBe(1);
    expect(tile.fire).not.toBeNull();
    applyFireTurn(map, () => 0.99);
    expect(tile.building).toBeNull();
    expect(tile.fire).toBeNull();
  });

  it('spreads to adjacent forests with 50% chance, never to land', () => {
    const map = makeTestMap(3);
    const src = tileAt(map, 0, 0)!;
    src.terrain = TileType.GrasslandForest;
    src.fire = { age: 0 };
    tileAt(map, 1, 0)!.terrain = TileType.GrasslandForest;
    tileAt(map, 0, 1)!.terrain = TileType.GrasslandForest;
    const report = applyFireTurn(map, () => 0.49);
    expect(tileAt(map, 1, 0)!.fire).toEqual({ age: 0 });
    expect(tileAt(map, 0, 1)!.fire).toEqual({ age: 0 });
    expect(tileAt(map, -1, 0)!.fire).toBeFalsy();
    expect(report.ignited).toHaveLength(2);
    const quiet = makeTestMap(3);
    const s2 = tileAt(quiet, 0, 0)!;
    s2.terrain = TileType.GrasslandForest;
    s2.fire = { age: 0 };
    tileAt(quiet, 1, 0)!.terrain = TileType.GrasslandForest;
    applyFireTurn(quiet, () => 0.5);
    expect(tileAt(quiet, 1, 0)!.fire).toBeFalsy();
  });
});

describe('extinguish', () => {
  it('puts out a fire on the own or an adjacent tile and spends the unit turn', () => {
    const map = makeTestMap(3);
    const forest = tileAt(map, 1, 0)!;
    forest.terrain = TileType.GrasslandForest;
    forest.fire = { age: 1 };
    const far = tileAt(map, -2, 0)!;
    far.terrain = TileType.GrasslandForest;
    far.fire = { age: 0 };
    const unit = makeUnit('u', 0, UnitType.WARRIOR, 0, 0);
    tileAt(map, 0, 0)!.unit = unit;
    expect(extinguishCells(map, unit)).toEqual([forest]);

    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    const sim = new Simulator(map, players, GameMode.TURNS30, { rng: () => 0.99 });
    sim.startGame();
    sim.drainEvents();
    expect(sim.applyCommand({ type: CommandType.EXTINGUISH, unitId: 'u', q: -2, r: 0 })).toBe(false);
    expect(sim.applyCommand({ type: CommandType.EXTINGUISH, unitId: 'u', q: 1, r: 0 })).toBe(true);
    expect(forest.fire).toBeNull();
    expect(unit.hasMoved && unit.hasAttacked).toBe(true);
    expect(sim.drainEvents().some((e) => e.type === GameEventType.FIRE_EXTINGUISHED)).toBe(true);
    expect(WEATHER_RULES.lightning.chance).toBe(0.15);
  });
});
