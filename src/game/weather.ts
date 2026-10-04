import { CompassDirection, WeatherType } from '@enums';
import { type Axial, axialKey, hexDistance, hexNeighbors, hexToPixel } from './hex';
import { type GameMap, type MapTile, tileMapByKey } from './map-gen';
import { isMountainType, isSolidGround, isWaterType } from './tile-types';

/** Tunable weather rules. A "turn" is a full round of all players. */
export const WEATHER_RULES = {
  /** The first spawn attempt is on this turn, then one every `interval` turns. */
  firstTurn: 9,
  interval: 3,
  /** Chance that an attempt produces an event. */
  chance: 0.3,
  maxActive: 2,
  storm: {
    lifetime: 6,
    minRadius: 2,
    maxRadius: 4,
    /** Damage to every ship in scope at the end of each turn. */
    shipDamage: 10,
    /** Damage to every port in scope on every `portEvery`-th turn of the storm. */
    portDamage: 1,
    portEvery: 2,
    /** Chance per turn that the storm drifts one tile. */
    moveChance: 0.5,
    /** Leaving a water tile inside a storm costs this many times more. */
    moveCostFactor: 2,
  },
  drought: { lifetime: 5, minRadius: 2, maxRadius: 4 },
  earthquake: {
    lifetime: 1,
    minRadius: 1,
    maxRadius: 3,
    /** Chance that a building / unit in scope is hit. */
    hitChance: 0.6,
    buildingDamage: 1,
    unitDamage: 20,
  },
} as const;

/** Hexes from the map middle within which a position reads as "the center". */
const CENTER_RADIUS = 2;

export interface WeatherEvent {
  /** Unique among the events of a game: type and the turn it started on. */
  id: string;
  type: WeatherType;
  q: number;
  r: number;
  radius: number;
  startTurn: number;
  /** Turns it has existed, 1 on the turn it appears. */
  age: number;
  lifetime: number;
  /** Storm only: keys of every tile the center has stood on. */
  pastCenters?: string[];
}

export interface WeatherUnitHit {
  unitId: string;
  owner: number;
  q: number;
  r: number;
  damage: number;
  died: boolean;
}

export interface WeatherBuildingHit {
  q: number;
  r: number;
  destroyed: boolean;
}

export function activeWeather(map: Pick<GameMap, 'weather'>): WeatherEvent[] {
  return map.weather ?? [];
}

/** Copies of the active events, safe to put in UI state. */
export function weatherCopies(map: Pick<GameMap, 'weather'>): WeatherEvent[] {
  return activeWeather(map).map((w) => ({ ...w }));
}

export function weatherInScope(event: Pick<WeatherEvent, 'q' | 'r' | 'radius'>, tile: Axial): boolean {
  return hexDistance(event, tile) <= event.radius;
}

/** Whether `tile` is a water tile inside an active storm. */
export function stormOverTile(map: Pick<GameMap, 'weather'>, tile: MapTile): boolean {
  if (!isWaterType(tile.terrain)) return false;
  return activeWeather(map).some((e) => e.type === WeatherType.STORM && weatherInScope(e, tile));
}

/** Whether `tile` is inside an active drought. */
export function droughtOverTile(map: Pick<GameMap, 'weather'>, tile: Axial): boolean {
  return activeWeather(map).some((e) => e.type === WeatherType.DROUGHT && weatherInScope(e, tile));
}

/** Halves a yield, rounding up so a producing building never drops to nothing. */
export function halvedYield(amount: number): number {
  return amount <= 0 ? amount : Math.max(1, Math.ceil(amount / 2));
}

/** The active events whose effects can touch `tile`: a storm acts on water, a
 *  drought on land (farms and mines), an earthquake on everything in scope. */
export function weatherEffectsAt(map: Pick<GameMap, 'weather'>, tile: MapTile): WeatherEvent[] {
  return activeWeather(map).filter((e) => {
    if (!weatherInScope(e, tile)) return false;
    if (e.type === WeatherType.STORM) return isWaterType(tile.terrain);
    if (e.type === WeatherType.DROUGHT) return !isWaterType(tile.terrain);
    return true;
  });
}

/** The weather overlay a tile is drawn with: the storm texture on water inside a
 *  storm, the drought texture on land inside a drought (never on water), else none. */
export function weatherOverlayAt(map: Pick<GameMap, 'weather'>, tile: MapTile): WeatherType.STORM | WeatherType.DROUGHT | null {
  if (stormOverTile(map, tile)) return WeatherType.STORM;
  if (!isWaterType(tile.terrain) && droughtOverTile(map, tile)) return WeatherType.DROUGHT;
  return null;
}

/** Direction of `point` from the middle of the map as seen on screen (north up). */
export function compassDirection(point: Axial): CompassDirection {
  if (hexDistance({ q: 0, r: 0 }, point) <= CENTER_RADIUS) return CompassDirection.CENTER;
  const { x, y } = hexToPixel(point, 1);
  const sector = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  const bySector: CompassDirection[] = [
    CompassDirection.EAST,
    CompassDirection.SOUTHEAST,
    CompassDirection.SOUTH,
    CompassDirection.SOUTHWEST,
    CompassDirection.WEST,
    CompassDirection.NORTHWEST,
    CompassDirection.NORTH,
    CompassDirection.NORTHEAST,
  ];
  return bySector[((sector % 8) + 8) % 8]!;
}

/** True on the turns where a spawn attempt is made. */
export function isWeatherSpawnTurn(turn: number): boolean {
  return turn >= WEATHER_RULES.firstTurn && (turn - WEATHER_RULES.firstTurn) % WEATHER_RULES.interval === 0;
}

const SPAWN_TYPES: readonly WeatherType[] = [WeatherType.STORM, WeatherType.DROUGHT, WeatherType.EARTHQUAKE];

function randomInt(min: number, max: number, rng: () => number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pickRandom<T>(items: readonly T[], rng: () => number): T | undefined {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function spawnCandidates(map: GameMap, type: WeatherType): MapTile[] {
  switch (type) {
    case WeatherType.STORM:
      return map.tiles.filter((t) => isWaterType(t.terrain));
    case WeatherType.DROUGHT:
      return map.tiles.filter((t) => isSolidGround(t.terrain));
    case WeatherType.EARTHQUAKE:
      return map.tiles.filter((t) => isMountainType(t.terrain));
  }
}

function radiusFor(type: WeatherType, rng: () => number): number {
  const rules = WEATHER_RULES[type];
  return randomInt(rules.minRadius, rules.maxRadius, rng);
}

/** One spawn attempt for `turn`: does nothing off the attempt turns or with the
 *  maximum already active; otherwise succeeds with `WEATHER_RULES.chance`, picks
 *  a random type and a random valid tile (no tile for that type = no event) and
 *  adds the new event to the map. Returns it. */
export function spawnWeather(map: GameMap, turn: number, rng: () => number): WeatherEvent | null {
  if (!isWeatherSpawnTurn(turn)) return null;
  if (activeWeather(map).length >= WEATHER_RULES.maxActive) return null;
  if (rng() >= WEATHER_RULES.chance) return null;
  return createWeather(map, pickRandom(SPAWN_TYPES, rng)!, turn, rng);
}

/** Adds a new event of `type` on a random valid tile (none = no event). */
export function createWeather(map: GameMap, type: WeatherType, turn: number, rng: () => number): WeatherEvent | null {
  const tile = pickRandom(spawnCandidates(map, type), rng);
  if (!tile) return null;
  const event: WeatherEvent = {
    id: `${type}@${turn}`,
    type,
    q: tile.q,
    r: tile.r,
    radius: radiusFor(type, rng),
    startTurn: turn,
    age: 1,
    lifetime: WEATHER_RULES[type].lifetime,
  };
  if (type === WeatherType.STORM) event.pastCenters = [axialKey(tile)];
  (map.weather ??= []).push(event);
  return event;
}

/** Ends a turn for every active event: it ages, expires once past its lifetime,
 *  and a storm may drift one tile onto a water tile its center has not stood on
 *  before. Returns the events that ended and the storms that moved. */
export function advanceWeather(map: GameMap, rng: () => number): { ended: WeatherEvent[]; moved: WeatherEvent[] } {
  const ended: WeatherEvent[] = [];
  const moved: WeatherEvent[] = [];
  if (!map.weather || map.weather.length === 0) return { ended, moved };
  const alive: WeatherEvent[] = [];
  const byKey = tileMapByKey(map);
  for (const event of activeWeather(map)) {
    event.age += 1;
    if (event.age > event.lifetime) {
      ended.push(event);
      continue;
    }
    alive.push(event);
    if (event.type !== WeatherType.STORM || rng() >= WEATHER_RULES.storm.moveChance) continue;
    const past = new Set(event.pastCenters ?? []);
    const targets = hexNeighbors(event).filter((n) => {
      const t = byKey.get(axialKey(n));
      return t !== undefined && isWaterType(t.terrain) && !past.has(axialKey(n));
    });
    const target = pickRandom(targets, rng);
    if (!target) continue;
    event.q = target.q;
    event.r = target.r;
    (event.pastCenters ??= []).push(axialKey(target));
    moved.push(event);
  }
  map.weather = alive;
  return { ended, moved };
}
