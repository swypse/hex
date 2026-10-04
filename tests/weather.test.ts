import { describe, expect, it } from 'vitest';
import { BuildingKind, CompassDirection, UnitType, WeatherType } from '@enums';
import { axialKey, hexDistance } from '../src/game/hex';
import { TileType } from '../src/game/tile-types';
import { tileMoveCost, TILE_MOVE_COST } from '../src/game/movement-cost';
import {
  advanceWeather,
  compassDirection,
  droughtOverTile,
  halvedYield,
  isWeatherSpawnTurn,
  spawnWeather,
  stormOverTile,
  weatherEffectsAt,
  weatherOverlayAt,
  WEATHER_RULES,
  type WeatherEvent,
} from '../src/game/weather';
import { applyEarthquake, applyStormTurn } from '../src/game/weather-effects';
import { makeTestMap, makeUnit, tileAt } from './helpers/test-map';

function storm(q: number, r: number, over: Partial<WeatherEvent> = {}): WeatherEvent {
  return { id: 'storm@9', type: WeatherType.STORM, q, r, radius: 2, startTurn: 9, age: 1, lifetime: 6, pastCenters: [axialKey({ q, r })], ...over };
}

/** A map with water on the east half and a mountain at the west edge. */
function mixedMap() {
  const map = makeTestMap(6);
  for (const t of map.tiles) if (t.q > 0) t.terrain = TileType.Water;
  tileAt(map, -3, 0)!.terrain = TileType.GrasslandMountain;
  return map;
}

/** A random source that returns the given values in turn, then 0.5. */
function sequence(...values: number[]): () => number {
  let i = 0;
  return () => (i < values.length ? values[i++]! : 0.5);
}

describe('spawn timing', () => {
  it('attempts on turn 9 and then every 3 turns, never before', () => {
    const turns = Array.from({ length: 20 }, (_, i) => i + 1).filter(isWeatherSpawnTurn);
    expect(turns).toEqual([9, 12, 15, 18]);
  });

  it('does nothing on a turn that is not an attempt turn', () => {
    const map = mixedMap();
    expect(spawnWeather(map, 10, () => 0)).toBeNull();
    expect(map.weather).toBeUndefined();
  });

  it('fails the 30% roll for random values at or above 0.3', () => {
    const map = mixedMap();
    expect(spawnWeather(map, 9, () => 0.3)).toBeNull();
    expect(spawnWeather(map, 9, () => 0.99)).toBeNull();
  });

  it('never exceeds two active events', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0), storm(4, 0, { id: 'storm@6' })];
    expect(spawnWeather(map, 9, () => 0)).toBeNull();
    expect(map.weather).toHaveLength(2);
  });

  it('creates an event of the picked type on a valid tile with a radius in range', () => {
    const map = mixedMap();
    // 0.1 passes the roll; 0.0 picks the storm; 0.0 picks the first water tile; 0.99 -> max radius
    const event = spawnWeather(map, 9, sequence(0.1, 0, 0, 0.99))!;
    expect(event.type).toBe(WeatherType.STORM);
    expect(tileAt(map, event.q, event.r)!.terrain).toBe(TileType.Water);
    expect(event.radius).toBe(WEATHER_RULES.storm.maxRadius);
    expect(event).toMatchObject({ age: 1, lifetime: 6, startTurn: 9, id: 'storm@9' });
    expect(event.pastCenters).toEqual([axialKey(event)]);
    expect(map.weather).toEqual([event]);
  });

  it('puts a drought on land and an earthquake on a mountain, with their lifetimes', () => {
    const map = mixedMap();
    const drought = spawnWeather(map, 9, sequence(0.1, 0.4, 0, 0))!;
    expect(drought.type).toBe(WeatherType.DROUGHT);
    expect(tileAt(map, drought.q, drought.r)!.terrain).not.toBe(TileType.Water);
    expect(drought.lifetime).toBe(5);
    map.weather = [];
    const quake = spawnWeather(map, 12, sequence(0.1, 0.9, 0, 0))!;
    expect(quake.type).toBe(WeatherType.EARTHQUAKE);
    expect([quake.q, quake.r]).toEqual([-3, 0]);
    expect(quake.lifetime).toBe(1);
  });

  it('makes no event when the picked type has no valid tile', () => {
    const map = makeTestMap(3); // all grassland: no water, no mountain
    expect(spawnWeather(map, 9, sequence(0.1, 0))).toBeNull(); // storm needs water
    expect(map.weather).toBeUndefined();
  });
});

describe('advanceWeather', () => {
  it('ages events and removes those past their lifetime', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0, { age: 6 }), storm(4, 0, { id: 'storm@6', age: 2 })];
    const { ended } = advanceWeather(map, () => 0.99); // 0.99: storms do not drift
    expect(ended.map((e) => e.id)).toEqual(['storm@9']);
    expect(map.weather.map((e) => [e.id, e.age])).toEqual([['storm@6', 3]]);
  });

  it('moves a storm one tile onto water with 50% chance and remembers the old center', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0)];
    const { moved } = advanceWeather(map, sequence(0.4, 0));
    expect(moved).toHaveLength(1);
    const ev = map.weather[0]!;
    expect(hexDistance({ q: 3, r: 0 }, ev)).toBe(1);
    expect(tileAt(map, ev.q, ev.r)!.terrain).toBe(TileType.Water);
    expect(ev.pastCenters).toEqual(['3,0', axialKey(ev)]);
  });

  it('does not move when the roll fails', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0)];
    expect(advanceWeather(map, () => 0.5).moved).toEqual([]);
    expect([map.weather[0]!.q, map.weather[0]!.r]).toEqual([3, 0]);
  });

  it('never steps back onto a tile that was already a center of the same storm', () => {
    const map = mixedMap();
    // every water neighbour of (3,0) is already a past center except none -> no move
    const neighbours = [[4, 0], [2, 1], [3, 1], [4, -1], [3, -1], [2, 0]].filter(([q, r]) => tileAt(map, q!, r!)?.terrain === TileType.Water);
    const past = ['3,0', ...neighbours.map(([q, r]) => `${q},${r}`)];
    map.weather = [storm(3, 0, { pastCenters: past })];
    expect(advanceWeather(map, () => 0).moved).toEqual([]);
  });

  it('lets another storm use the cells an earlier storm visited', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0, { pastCenters: ['3,0', '4,0'] }), storm(4, 1, { id: 'storm@6', pastCenters: ['4,1'] })];
    advanceWeather(map, sequence(0.9, 0.4, 0));
    expect(map.weather[1]!.pastCenters!.length).toBe(2);
  });
});

describe('compassDirection', () => {
  it.each([
    [{ q: 0, r: 0 }, CompassDirection.CENTER],
    [{ q: 1, r: 1 }, CompassDirection.CENTER],
    [{ q: 8, r: 0 }, CompassDirection.EAST],
    [{ q: -8, r: 0 }, CompassDirection.WEST],
    [{ q: 0, r: 8 }, CompassDirection.SOUTHEAST],
    [{ q: -8, r: 8 }, CompassDirection.SOUTHWEST],
    [{ q: 8, r: -8 }, CompassDirection.NORTHEAST],
    [{ q: 0, r: -8 }, CompassDirection.NORTHWEST],
  ])('names %j as %s', (point, direction) => {
    expect(compassDirection(point)).toBe(direction);
  });

  it('points north and south for tiles straight above and below the middle', () => {
    expect(compassDirection({ q: -5, r: 10 })).toBe(CompassDirection.SOUTH);
    expect(compassDirection({ q: 5, r: -10 })).toBe(CompassDirection.NORTH);
  });
});

describe('queries', () => {
  it('stormOverTile is true only for water tiles inside a storm', () => {
    const map = mixedMap();
    map.weather = [storm(3, 0, { radius: 2 })];
    expect(stormOverTile(map, tileAt(map, 2, 0)!)).toBe(true);
    expect(stormOverTile(map, tileAt(map, 6, 0)!)).toBe(false); // too far
    map.weather = [storm(3, 0, { radius: 4 })];
    expect(stormOverTile(map, tileAt(map, -1, 0)!)).toBe(false); // land
  });

  it('halvedYield rounds up and never drops a producing building to 0', () => {
    expect([halvedYield(1), halvedYield(2), halvedYield(3), halvedYield(0)]).toEqual([1, 1, 2, 0]);
  });

  it('a storm doubles the cost of leaving a water tile, a calm sea does not', () => {
    const map = mixedMap();
    const water = tileAt(map, 2, 0)!;
    expect(tileMoveCost(map, water, 0)).toBe(TILE_MOVE_COST.water);
    map.weather = [storm(3, 0, { radius: 2 })];
    expect(tileMoveCost(map, water, 0)).toBe(TILE_MOVE_COST.water * WEATHER_RULES.storm.moveCostFactor);
    expect(tileMoveCost(map, tileAt(map, -1, 0)!, 0)).toBe(TILE_MOVE_COST.land);
  });

  it('droughtOverTile follows the scope of a drought only', () => {
    const map = mixedMap();
    map.weather = [{ ...storm(0, 0), type: WeatherType.DROUGHT, id: 'drought@9', lifetime: 5, radius: 2 }];
    expect(droughtOverTile(map, { q: 1, r: 1 })).toBe(true);
    expect(droughtOverTile(map, { q: 3, r: 3 })).toBe(false);
    map.weather = [storm(0, 0)];
    expect(droughtOverTile(map, { q: 0, r: 0 })).toBe(false);
  });
});

describe('storm effects', () => {
  function stormScene() {
    const map = mixedMap();
    const inside = makeUnit('in', 1, UnitType.WARRIOR, 3, 0);
    inside.shipLevel = 1;
    const outside = makeUnit('out', 1, UnitType.WARRIOR, 6, 0);
    outside.shipLevel = 1;
    const landUnit = makeUnit('land', 0, UnitType.WARRIOR, -1, 0);
    tileAt(map, 3, 0)!.unit = inside;
    tileAt(map, 6, 0)!.unit = outside;
    tileAt(map, -1, 0)!.unit = landUnit;
    const portTile = tileAt(map, 2, 0)!;
    portTile.building = { kind: BuildingKind.PORT, level: 1 };
    return { map, inside, outside, landUnit, portTile };
  }

  it('hits only the ships inside the scope for 10', () => {
    const { map, inside, outside, landUnit } = stormScene();
    const report = applyStormTurn(map, storm(3, 0, { radius: 2 }));
    expect(report.units.map((u) => [u.unitId, u.damage, u.died])).toEqual([['in', 10, false]]);
    expect(inside.hp).toBe(40);
    expect(outside.hp).toBe(50);
    expect(landUnit.hp).toBe(50);
  });

  it('sinks a ship whose hp runs out', () => {
    const { map, inside } = stormScene();
    inside.hp = 10;
    const report = applyStormTurn(map, storm(3, 0, { radius: 2 }));
    expect(report.units[0]).toMatchObject({ unitId: 'in', died: true });
    expect(tileAt(map, 3, 0)!.unit).toBeNull();
  });

  it('hits pirate ships too', () => {
    const { map } = stormScene();
    const pirate = makeUnit('p', -1, UnitType.PIRATE, 4, 0);
    tileAt(map, 4, 0)!.unit = pirate;
    const report = applyStormTurn(map, storm(3, 0, { radius: 2 }));
    expect(report.units.map((u) => u.unitId)).toContain('p');
    expect(pirate.hp).toBe(70); // pirates start with 80 hp
  });

  it('damages ports in scope only on every second turn of the storm', () => {
    const { map, portTile } = stormScene();
    expect(applyStormTurn(map, storm(3, 0, { radius: 2, age: 1 })).buildings).toEqual([]);
    expect(portTile.building!.hp).toBeUndefined();
    const second = applyStormTurn(map, storm(3, 0, { radius: 2, age: 2 }));
    expect(second.buildings).toEqual([{ q: 2, r: 0, destroyed: false }]);
    expect(portTile.building!.hp).toBe(1);
    const fourth = applyStormTurn(map, storm(3, 0, { radius: 2, age: 4 }));
    expect(fourth.buildings).toEqual([{ q: 2, r: 0, destroyed: true }]);
    expect(portTile.building).toBeNull();
  });
});

describe('earthquake effects', () => {
  function quakeScene() {
    const map = mixedMap();
    const farm = tileAt(map, -2, 0)!;
    farm.building = { kind: BuildingKind.FARM, level: 1 };
    const unit = makeUnit('u', 0, UnitType.WARRIOR, -2, 1);
    tileAt(map, -2, 1)!.unit = unit;
    const quake: WeatherEvent = { id: 'earthquake@9', type: WeatherType.EARTHQUAKE, q: -3, r: 0, radius: 2, startTurn: 9, age: 1, lifetime: 1 };
    return { map, farm, unit, quake };
  }

  it('hits buildings and units in scope when the 60% roll succeeds', () => {
    const { map, farm, unit, quake } = quakeScene();
    const report = applyEarthquake(map, quake, () => 0.1);
    expect(farm.building!.hp).toBe(1);
    expect(unit.hp).toBe(30);
    expect(report.buildings).toEqual([{ q: -2, r: 0, destroyed: false }]);
    expect(report.units).toEqual([{ unitId: 'u', owner: 0, q: -2, r: 1, damage: 20, died: false }]);
  });

  it('spares everything when the roll fails', () => {
    const { map, farm, unit, quake } = quakeScene();
    const report = applyEarthquake(map, quake, () => 0.6);
    expect(report).toEqual({ units: [], buildings: [] });
    expect(farm.building!.hp).toBeUndefined();
    expect(unit.hp).toBe(50);
  });

  it('leaves things outside the scope alone', () => {
    const { map, quake } = quakeScene();
    const far = tileAt(map, -6, 0)!;
    far.building = { kind: BuildingKind.FARM, level: 1 };
    applyEarthquake(map, quake, () => 0);
    expect(far.building!.hp).toBeUndefined();
  });

  it('does not touch villages', () => {
    const { map, quake } = quakeScene();
    const village = tileAt(map, -4, 0)!;
    village.settlement = { owner: 0, level: 2, captureReady: false, wall: true } as never;
    applyEarthquake(map, quake, () => 0);
    expect(village.settlement).toMatchObject({ level: 2, wall: true });
  });
});

describe('weatherOverlayAt', () => {
  const drought = (q: number, r: number, radius = 3): WeatherEvent => ({ ...storm(q, r), type: WeatherType.DROUGHT, id: 'drought@9', lifetime: 5, radius, pastCenters: undefined });

  it('puts the drought art on land inside a drought and never on water', () => {
    const map = mixedMap();
    map.weather = [drought(0, 0)];
    expect(weatherOverlayAt(map, tileAt(map, -1, 0)!)).toBe(WeatherType.DROUGHT); // land in scope
    expect(weatherOverlayAt(map, tileAt(map, 1, 0)!)).toBeNull(); // water in scope
    expect(weatherOverlayAt(map, tileAt(map, -6, 0)!)).toBeNull(); // land out of scope
  });

  it('puts the storm art on water inside a storm and never on land', () => {
    const map = mixedMap();
    map.weather = [storm(0, 0, { radius: 3 })];
    expect(weatherOverlayAt(map, tileAt(map, 1, 0)!)).toBe(WeatherType.STORM); // water
    expect(weatherOverlayAt(map, tileAt(map, -1, 0)!)).toBeNull(); // land
  });

  it('gives each tile at most one overlay when a storm and a drought overlap', () => {
    const map = mixedMap();
    map.weather = [storm(1, 0, { radius: 3 }), drought(1, 0, 3)];
    expect(weatherOverlayAt(map, tileAt(map, 1, 0)!)).toBe(WeatherType.STORM); // water: storm only
    expect(weatherOverlayAt(map, tileAt(map, -1, 0)!)).toBe(WeatherType.DROUGHT); // land: drought only
  });

  it('is none when the weather is calm', () => {
    const map = mixedMap();
    expect(weatherOverlayAt(map, tileAt(map, 1, 0)!)).toBeNull();
    map.weather = [{ ...storm(0, 0), type: WeatherType.EARTHQUAKE, id: 'earthquake@9', lifetime: 1 }];
    expect(weatherOverlayAt(map, tileAt(map, -3, 0)!)).toBeNull();
  });
});

describe('weatherEffectsAt', () => {
  it('lists the events that act on the tile: storm on water, drought on land, earthquake on both', () => {
    const map = mixedMap();
    const quake: WeatherEvent = { ...storm(0, 0), type: WeatherType.EARTHQUAKE, id: 'earthquake@9', lifetime: 1, radius: 3, pastCenters: undefined };
    const drought: WeatherEvent = { ...storm(0, 0), type: WeatherType.DROUGHT, id: 'drought@9', lifetime: 5, radius: 3, pastCenters: undefined };
    map.weather = [storm(0, 0, { radius: 3 }), drought, quake];
    const land = tileAt(map, -1, 0)!;
    const water = tileAt(map, 1, 0)!;
    expect(weatherEffectsAt(map, land).map((e) => e.type)).toEqual([WeatherType.DROUGHT, WeatherType.EARTHQUAKE]);
    expect(weatherEffectsAt(map, water).map((e) => e.type)).toEqual([WeatherType.STORM, WeatherType.EARTHQUAKE]);
  });

  it('is empty outside every scope and in calm weather', () => {
    const map = mixedMap();
    expect(weatherEffectsAt(map, tileAt(map, 1, 0)!)).toEqual([]);
    map.weather = [storm(5, 0, { radius: 1 })];
    expect(weatherEffectsAt(map, tileAt(map, -5, 0)!)).toEqual([]);
  });
});
