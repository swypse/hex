import { describe, expect, it } from 'vitest';
import { BuildingKind, CommandType, GameEventType, GameMode, SkillId, UnitType, WeatherType } from '@enums';
import { buildingIncome } from '../src/game/economy/buildings';
import { farmYield } from '../src/game/economy/food';
import { axialKey } from '../src/game/map/hex';
import { buildPlayers } from '../src/game/players';
import { Simulator } from '../src/game/simulator';
import { TileType } from '../src/game/map/tile-types';
import { Tribe } from '../src/game/tribes';
import type { WeatherEvent } from '../src/game/weather/weather';
import { SeededRandom } from '../src/util/random';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function weatherOf(type: WeatherType, q: number, r: number, over: Partial<WeatherEvent> = {}): WeatherEvent {
  return { id: `${type}@9`, type, q, r, radius: 2, startTurn: 9, age: 1, lifetime: 5, ...over };
}

function seaMap() {
  const map = makeTestMap(5);
  for (const t of map.tiles) if (t.q > 0) t.terrain = TileType.Water;
  tileAt(map, -3, 0)!.terrain = TileType.GrasslandMountain;
  return map;
}

function simOn(map: ReturnType<typeof makeTestMap>, rng: () => number = () => 0.99) {
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, GameMode.TURNS30, { rng });
  sim.startGame();
  sim.drainEvents();
  return sim;
}

const environment = (sim: Simulator): { advanceWeatherEvents(): void; applyWeatherEffects(): void } => (sim as unknown as { environment: { advanceWeatherEvents(): void; applyWeatherEffects(): void } }).environment;
const advance = (sim: Simulator): void => environment(sim).advanceWeatherEvents();
const effects = (sim: Simulator): void => environment(sim).applyWeatherEffects();

describe('drought economy', () => {
  it('halves the food of farms inside the drought and leaves the others alone', () => {
    const map = seaMap();
    const inside = tileAt(map, -1, 0)!;
    const outside = tileAt(map, -5, 0)!;
    map.weather = [weatherOf(WeatherType.DROUGHT, -1, 0)];
    expect(farmYield(null, map, inside)).toBe(1); // 2 -> 1
    expect(farmYield(null, map, outside)).toBe(2);
    expect(farmYield(null, map)).toBe(2); // no tile given: normal
  });

  it('halves a mine with the geology bonus, but never below 1', () => {
    const map = seaMap();
    const mine = tileAt(map, -1, 0)!;
    mine.terrain = TileType.GrasslandMountain;
    mine.ownedBy = 0;
    mine.building = { kind: BuildingKind.MINE, level: 1 };
    const geologist = { index: 0, skills: [SkillId.GEOLOGY] } as never;
    const plain = { index: 0, skills: [] } as never;
    expect(buildingIncome(map, geologist)).toMatchObject({ stone: 2, ore: 2 });
    expect(buildingIncome(map, plain)).toMatchObject({ stone: 1, ore: 1 });
    map.weather = [weatherOf(WeatherType.DROUGHT, -1, 0)];
    expect(buildingIncome(map, geologist)).toMatchObject({ stone: 1, ore: 1 });
    expect(buildingIncome(map, plain)).toMatchObject({ stone: 1, ore: 1 });
  });
});

describe('round-end weather in the simulator', () => {
  it('starts an event on turn 9 and announces it', () => {
    // 0.2 passes the 30% roll but misses lightning's 15%.
    const sim = simOn(seaMap(), () => 0.2);
    sim.turn = 9;
    advance(sim);
    const events = sim.drainEvents();
    const started = events.find((e) => e.type === GameEventType.WEATHER_STARTED);
    expect(started).toBeDefined();
    expect(sim.map.weather).toHaveLength(1);
  });

  it('starts nothing on turns that are not attempt turns', () => {
    const sim = simOn(seaMap(), () => 0.1);
    sim.turn = 10;
    advance(sim);
    expect(sim.map.weather).toBeUndefined();
    expect(sim.drainEvents()).toEqual([]);
  });

  it('an earthquake strikes the moment it starts and reports the damage', () => {
    const map = seaMap();
    const farm = tileAt(map, -2, 0)!;
    farm.building = { kind: BuildingKind.FARM, level: 1 };
    // 0.2: passes the 30% roll, misses lightning's 15%; 0.9 -> the earthquake; mountain -3,0 is the only candidate; and 0.2 hits.
    const values = [0.2, 0.9, 0, 0, ...Array(20).fill(0.2)];
    let i = 0;
    const sim = simOn(map, () => values[i++] ?? 0.2);
    sim.turn = 9;
    i = 0;
    advance(sim);
    const events = sim.drainEvents();
    expect(events.map((e) => e.type)).toEqual([GameEventType.WEATHER_STARTED, GameEventType.WEATHER_DAMAGE]);
    expect(farm.building).toBeNull();
  });

  it('a storm damages the ships in its scope at the end of the turn', () => {
    const map = seaMap();
    const ship = makeUnit('s', 1, UnitType.WARRIOR, 3, 0);
    ship.shipLevel = 1;
    tileAt(map, 3, 0)!.unit = ship;
    const sim = simOn(map);
    sim.map.weather = [weatherOf(WeatherType.STORM, 3, 0, { lifetime: 6, pastCenters: [axialKey({ q: 3, r: 0 })] })];
    effects(sim);
    expect(ship.hp).toBe(40);
    const damage = sim.drainEvents().find((e) => e.type === GameEventType.WEATHER_DAMAGE);
    expect(damage).toMatchObject({ units: [{ unitId: 's', damage: 10, died: false }] });
  });

  it('ends a storm after its lifetime and announces it', () => {
    const sim = simOn(seaMap());
    sim.map.weather = [weatherOf(WeatherType.STORM, 3, 0, { age: 6, lifetime: 6, pastCenters: [] })];
    sim.turn = 10;
    advance(sim);
    expect(sim.map.weather).toEqual([]);
    expect(sim.drainEvents().map((e) => e.type)).toEqual([GameEventType.WEATHER_ENDED]);
  });

  it('runs through a real end of turn and keeps weather in the save', () => {
    const sim = simOn(seaMap());
    sim.map.weather = [weatherOf(WeatherType.DROUGHT, -1, 0)];
    sim.applyCommand({ type: CommandType.END_TURN });
    const restored = Simulator.fromSnapshot(sim.snapshot());
    expect(restored.map.weather).toEqual(sim.map.weather);
    expect(restored.map.weather![0]!.age).toBe(2);
  });
});

describe('weather cheat', () => {
  it('forceWeather starts the event at once and reports it', () => {
    const sim = simOn(seaMap());
    expect(sim.forceWeather(WeatherType.STORM)).toBe(true);
    expect(sim.map.weather).toHaveLength(1);
    expect(sim.map.weather![0]!.type).toBe(WeatherType.STORM);
    expect(sim.drainEvents().map((e) => e.type)).toEqual([GameEventType.WEATHER_STARTED]);
  });

  it('ends the oldest event to make room when two are already active', () => {
    const sim = simOn(seaMap());
    sim.map.weather = [weatherOf(WeatherType.DROUGHT, -1, 0), weatherOf(WeatherType.STORM, 3, 0, { id: 'storm@6', startTurn: 6 })];
    expect(sim.forceWeather(WeatherType.STORM)).toBe(true);
    expect(sim.map.weather).toHaveLength(2);
    expect(sim.map.weather!.map((e) => e.type)).toEqual([WeatherType.STORM, WeatherType.STORM]);
    const events = sim.drainEvents();
    expect(events[0]).toMatchObject({ type: GameEventType.WEATHER_ENDED, weather: { type: WeatherType.DROUGHT } });
    expect(events[1]!.type).toBe(GameEventType.WEATHER_STARTED);
  });

  it('refuses when the map has no place for the event', () => {
    const sim = simOn(makeTestMap(3)); // no water, no mountain
    expect(sim.forceWeather(WeatherType.STORM)).toBe(false);
    expect(sim.forceWeather(WeatherType.EARTHQUAKE)).toBe(false);
  });
});
