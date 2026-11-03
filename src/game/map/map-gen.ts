import { allTiles, axialKey, hexDistance, hexNeighbors, ringOf, tilesInRange } from './hex';
import { generateVillageNames } from '../names';
import { START_STOCK, type Stock } from '../economy/resources';
import { isForestType, isLandType, isMountainType, isWaterType, TileType } from './tile-types';
import { Biome, BIOME_FOREST, BIOME_LAND, BIOME_MOUNTAIN, biomeAffinity, generateTerrain } from './biomes';
import { SeededRandom } from '../../util/random';
import { makeUnit, type Unit } from '../units/units';
import { claimTileForVillage } from '../economy/claim';
import { placeBonuses, type Bonus } from './bonus';
import type { WeatherEvent } from '../weather/weather';
import { BridgeDir, BuildingKind, Season, TerrainFeature, type Tribe, UnitType, VillageBlockVariant } from '@enums';

const WATER_BORDER = 2;
const FREE_VILLAGE_MAX_DIST = 7;

/** Below-top block variants per column, top-down, chosen when a village
 *  levels up. `l[0..2]` are left columns 1–3, `r[0..1]` right columns 1–2,
 *  `lBack[0..1]` the two left-back columns, `rBack[0]` the right-back column;
 *  each inner array has length `level - 1`. Back columns are absent on records
 *  created before they existed (rendered as `m1`). The whole record is absent
 *  for level-1 villages and older saves. */
export interface SettlementBuild {
  l: VillageBlockVariant[][];
  r: VillageBlockVariant[][];
  lBack?: VillageBlockVariant[][];
  rBack?: VillageBlockVariant[][];
}

export interface Settlement {
  owner: number | null;
  level: number;
  captureReady: boolean;
  name?: string;
  capital?: boolean;
  /** Territory radius; unset on old saves (then derived from the level, see `settlementRadius`). */
  radius?: number;
  /** Level the village income is paid for; unset means its level. A veteran swordsman taken
   *  instead of an income raise leaves it behind the level. */
  incomeLevel?: number;
  /** Built wall: units inside gain bonus defense. */
  wall?: boolean;
  /** True after a turn end in which the village could not feed its units. */
  starving?: boolean;
  /** Villagers composite-village block choices (see `SettlementBuild`). */
  build?: SettlementBuild;
  /** Wood, stone, ore and food held by this village (shared by its road/port network). */
  stock?: Stock;
}


export interface Bridge {
  owner: number;
  dir: BridgeDir;
}

export interface Building {
  kind: BuildingKind;
  level: number;
  /** Granary only: food stored (0 at creation, +1 per adjacent farm each turn). */
  food?: number;
  /** Sawmill: wood held (cap 20). Mine: stone and ore held (cap 20 each). They
   *  pay builds and spawns of the village network the building stands in. */
  wood?: number;
  stone?: number;
  ore?: number;
  bornTurn?: number;
  /** Remaining hp after catapult siege damage; `undefined` = full (2). */
  hp?: number;
}

/** A floating message-in-a-bottle on a water tile. `arrivalTurn` is set when
 *  a ship moves onto the tile; the bottle can then be collected next turn. */
interface Bottle {
  bornTurn: number;
  arrivalTurn: number;
}

export interface MapTile {
  q: number;
  r: number;
  terrain: TileType;
  biome?: Biome;
  temperature?: number;
  rain?: number;
  height?: number;
  settlement: Settlement | null;
  building: Building | null;
  bottle?: Bottle | null;
  roadOwner?: number | null;
  bridge?: Bridge | null;
  unit: Unit | null;
  ownedBy: number | null;
  claimedByVillage: { q: number; r: number } | null;
  exploredBy?: number[];
  bonus?: Bonus | null;
  /** Trapper thorn trap: visible only to its owner. */
  trap?: { owner: number; placedTurn: number } | null;
  /** Burning forest / building / bridge (lightning, spread); `age` = round ends survived. */
  fire?: { age: number } | null;
  /** Burnt ground left where fire destroyed a building or forest; cleared when something is built here. */
  fireTrail?: boolean;
}

export interface Spawn {
  start: { q: number; r: number };
  free: { q: number; r: number };
}

export interface GameMap {
  /** Current season (kept in sync by the simulator); spring when absent. */
  season?: Season;
  /** Weather events currently active (see game/weather.ts); absent in saves from before weather. */
  weather?: WeatherEvent[];
  radius: number;
  tiles: MapTile[];
  spawns: Spawn[];
}



function baseMapRadius(playerCount: number): number {
  if (playerCount === 2) return Math.round(11 / 1.5);
  if (playerCount === 3) return Math.round(12 / 1.5);
  if (playerCount === 4) return Math.round(14 / 1.5);
  if (playerCount === 5) return Math.round(15 / 1.5);
  if (playerCount === 6) return Math.round(16 / 1.5);
  if (playerCount === 7) return Math.round(18 / 1.5);
  throw new Error(`Unsupported player count: ${playerCount}`);
}

/** Extra rings added to the base radius of every player count. */
const MAP_RADIUS_BONUS = 1;

export function mapRadiusFor(playerCount: number): number {
  return baseMapRadius(playerCount) + MAP_RADIUS_BONUS;
}

export function bridgeIslandVillages(tiles: MapTile[]): void {
  const tileMap = new Map<string, MapTile>(tiles.map((t) => [axialKey(t), t]));
  for (const tile of tiles) {
    if (!tile.settlement) continue;
    const ring1AllLand = ringOf(tile, 1).every((n) => {
      const t = tileMap.get(axialKey(n));
      return t !== undefined && !isWaterType(t.terrain);
    });
    if (!ring1AllLand) continue;
    const ring2AllWater = ringOf(tile, 2).every((n) => {
      const t = tileMap.get(axialKey(n));
      return t !== undefined && isWaterType(t.terrain);
    });
    if (!ring2AllWater) continue;
    bridgeToNearestLand(tileMap, tile);
  }
}

function bridgeToNearestLand(tileMap: Map<string, MapTile>, settlement: MapTile): void {
  const key = (a: { q: number; r: number }): string => axialKey(a);
  const visited = new Set<string>();
  const parent = new Map<string, { q: number; r: number } | null>();
  const queue: { q: number; r: number }[] = [];
  for (const n of ringOf(settlement, 1)) {
    const k = key(n);
    if (!visited.has(k)) {
      visited.add(k);
      parent.set(k, null);
      queue.push(n);
    }
  }
  let target: { q: number; r: number } | null = null;
  while (queue.length > 0 && !target) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const k = key(n);
      if (visited.has(k)) continue;
      const t = tileMap.get(k);
      if (!t) continue;
      visited.add(k);
      parent.set(k, cur);
      if (!isWaterType(t.terrain) && hexDistance(settlement, n) >= 2) {
        target = n;
        break;
      }
      if (isWaterType(t.terrain)) queue.push(n);
    }
  }
  if (!target) return;
  let cur: { q: number; r: number } | null = target;
  while (cur) {
    const t = tileMap.get(key(cur));
    if (t && isWaterType(t.terrain)) {
      t.terrain = BIOME_LAND[t.biome!];
    }
    cur = parent.get(key(cur)) ?? null;
  }
}

/** True when `from` reaches `to` moving only over non-water tiles. */
function landReachable(tileMap: Map<string, MapTile>, from: { q: number; r: number }, to: { q: number; r: number }): boolean {
  const target = axialKey(to);
  const visited = new Set<string>([axialKey(from)]);
  const queue: { q: number; r: number }[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const k = axialKey(n);
      if (visited.has(k)) continue;
      const t = tileMap.get(k);
      if (!t || isWaterType(t.terrain)) continue;
      if (k === target) return true;
      visited.add(k);
      queue.push(n);
    }
  }
  return false;
}

/** Converts the fewest water tiles to land so `from` has a non-water-only path
 *  to `to` (0-1 BFS: crossing a land tile costs 0, a water tile costs 1). */
function paveLandPath(tileMap: Map<string, MapTile>, from: { q: number; r: number }, to: { q: number; r: number }): void {
  const startKey = axialKey(from);
  const target = axialKey(to);
  const cost = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string | null>([[startKey, null]]);
  const deque: { q: number; r: number }[] = [from];
  while (deque.length > 0) {
    const cur = deque.shift()!;
    const curKey = axialKey(cur);
    if (curKey === target) break;
    const curCost = cost.get(curKey)!;
    for (const n of hexNeighbors(cur)) {
      const k = axialKey(n);
      const t = tileMap.get(k);
      if (!t) continue;
      const step = isWaterType(t.terrain) ? 1 : 0;
      const next = curCost + step;
      const best = cost.get(k);
      if (best !== undefined && next >= best) continue;
      cost.set(k, next);
      parent.set(k, curKey);
      if (step === 0) deque.unshift(n);
      else deque.push(n);
    }
  }
  if (parent.get(target) === undefined) return;
  let cur: string | null = target;
  while (cur) {
    const t = tileMap.get(cur);
    // Forest and mountain are still passable, so converting to the biome's land
    // tile is enough.
    if (t && isWaterType(t.terrain)) t.terrain = BIOME_LAND[t.biome!];
    cur = parent.get(cur) ?? null;
  }
}

/** Gives every starting (owned) village a non-water path to its empty village,
 *  paving any water in between, so a player is never boxed in on an island. */
export function ensureStartVillagePaths(tiles: MapTile[], spawns: Spawn[]): void {
  const tileMap = new Map<string, MapTile>(tiles.map((t) => [axialKey(t), t] as const));
  for (const { start, free } of spawns) {
    const s = tileMap.get(axialKey(start));
    const f = tileMap.get(axialKey(free));
    if (!s || !f) continue;
    if (landReachable(tileMap, s, f)) continue;
    paveLandPath(tileMap, s, f);
  }
}

function ensureResourceNearVillage(  tileMap: Map<string, MapTile>,
  village: MapTile,
  reserved: Set<string>,
): void {
  const claimedByThis = (t: MapTile): boolean => {
    const c = t.claimedByVillage;
    return c === null || (c.q === village.q && c.r === village.r);
  };
  const provide = (wanted: TerrainFeature): void => {
    for (const n of tilesInRange(village, 2)) {
      if (hexDistance(n, village) < 1) continue;
      const t = tileMap.get(axialKey(n));
      if (!t || reserved.has(axialKey(n)) || t.settlement || !claimedByThis(t)) continue;
      const found = wanted === TerrainFeature.MOUNTAIN ? isMountainType(t.terrain) : isForestType(t.terrain);
      if (found) {
        reserved.add(axialKey(n));
        return;
      }
    }
    for (const n of tilesInRange(village, 2)) {
      if (hexDistance(n, village) < 1) continue;
      const t = tileMap.get(axialKey(n));
      if (!t || reserved.has(axialKey(n)) || t.settlement || !claimedByThis(t)) continue;
      if (!isLandType(t.terrain)) continue;
      t.terrain = wanted === TerrainFeature.MOUNTAIN ? BIOME_MOUNTAIN[t.biome!] : BIOME_FOREST[t.biome!];
      reserved.add(axialKey(n));
      return;
    }
  };
  provide(TerrainFeature.MOUNTAIN);
  provide(TerrainFeature.FOREST);
}

function angleOf(tile: { q: number; r: number }): number {
  const x = Math.sqrt(3) * tile.q + (Math.sqrt(3) / 2) * tile.r;
  const y = (3 / 2) * tile.r;
  return Math.atan2(y, x);
}

function sectorCenterAngle(sector: number, playerCount: number): number {
  return ((sector + 0.5) / playerCount) * 2 * Math.PI - Math.PI;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 2 * Math.PI - d);
}

/** Land tiles of a start sector, the area a player's start village is picked from. */
function sectorTiles(tiles: { q: number; r: number }[], sector: number, playerCount: number, radius: number): { q: number; r: number }[] {
  const target = sectorCenterAngle(sector, playerCount);
  return tiles.filter(
    (t) => angleDiff(angleOf(t), target) < Math.PI / playerCount && !(t.q === 0 && t.r === 0) && hexDistance({ q: 0, r: 0 }, t) <= radius - 2,
  );
}

/** Which sector each player starts in (index = player). Players are matched to
 *  the sectors whose biomes suit their tribe best; the identity assignment when
 *  no tribes are given or nobody has a preference. */
function assignSectors(
  tileMap: Map<string, MapTile>,
  tiles: { q: number; r: number }[],
  playerCount: number,
  radius: number,
  tribes: readonly Tribe[] | undefined,
): number[] {
  const identity = Array.from({ length: playerCount }, (_, i) => i);
  if (!tribes || tribes.length < playerCount) return identity;
  // fit[p][s]: mean affinity of player p's tribe for the land of sector s.
  const fit = identity.map((p) =>
    identity.map((s) => {
      const land = sectorTiles(tiles, s, playerCount, radius).map((t) => tileMap.get(axialKey(t))!).filter((t) => !isWaterType(t.terrain));
      if (land.length === 0) return 0;
      return land.reduce((sum, t) => sum + biomeAffinity(tribes[p], t.biome), 0) / land.length;
    }),
  );
  if (!fit.some((row) => row.some((v) => v > 0))) return identity;
  let best = identity;
  let bestScore = -1;
  const used = new Array<boolean>(playerCount).fill(false);
  const current: number[] = [];
  const search = (p: number, score: number): void => {
    if (p === playerCount) {
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [...current];
      }
      return;
    }
    for (let s = 0; s < playerCount; s++) {
      if (used[s]) continue;
      used[s] = true;
      current[p] = s;
      search(p + 1, score + fit[p]![s]!);
      used[s] = false;
    }
  };
  // Exhaustive for the player counts the game offers; fall back to the given order beyond that.
  if (playerCount <= 7) search(0, 0);
  return best;
}

export function generateMap(playerCount: number, seed: number, tribes?: readonly Tribe[]): GameMap {
  const radius = mapRadiusFor(playerCount) + WATER_BORDER;
  const rng = new SeededRandom(seed);
  const villageNames = generateVillageNames(playerCount * 2, rng);
  const tiles = allTiles(radius);
  const tileMap = new Map<string, MapTile>();
  for (const t of tiles) {
    tileMap.set(axialKey(t), {
      q: t.q,
      r: t.r,
      terrain: TileType.GrasslandLand,
      settlement: null,
      building: null,
      roadOwner: null,
      unit: null,
      ownedBy: null,
      claimedByVillage: null,
      exploredBy: [],
      bonus: null,
    });
  }

  generateTerrain([...tileMap.values()], seed);

  for (const tile of tileMap.values()) {
    if (hexDistance({ q: 0, r: 0 }, tile) >= radius - (WATER_BORDER - 1)) {
      tile.terrain = TileType.Water;
    }
  }

  const reserved = new Set<string>();
  const spawns: Spawn[] = [];
  const placedVillages: { q: number; r: number }[] = [];

  const isTooCloseToAnyVillage = (t: { q: number; r: number }): boolean =>
    placedVillages.some((v) => hexDistance(t, v) < 4);

  const sectorOf = assignSectors(tileMap, tiles, playerCount, radius, tribes);
  for (let p = 0; p < playerCount; p++) {
    const inSector = sectorTiles(tiles, sectorOf[p]!, playerCount, radius);
    const pickFrom = (arr: { q: number; r: number }[]): { q: number; r: number } => {
      const pool = arr.length > 0 ? arr : inSector;
      return pool[Math.floor(rng.next() * pool.length)]!;
    };
    // A start village on land of its tribe's biome, when the sector has any.
    const suited = (arr: { q: number; r: number }[]): { q: number; r: number }[] => {
      if (!tribes) return arr;
      const fit = arr.filter((t) => {
        const tile = tileMap.get(axialKey(t))!;
        return !isWaterType(tile.terrain) && biomeAffinity(tribes[p], tile.biome) > 0;
      });
      return fit.length > 0 ? fit : arr;
    };
    let candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const start = pickFrom(suited(candidates));
    for (const n of hexNeighbors(start)) reserved.add(axialKey(n));
    placedVillages.push(start);

    candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const nearFree = candidates.filter((t) => hexDistance(t, start) <= FREE_VILLAGE_MAX_DIST);
    const free = pickFrom(suited(nearFree.length > 0 ? nearFree : candidates));
    for (const n of hexNeighbors(free)) reserved.add(axialKey(n));
    placedVillages.push(free);

    spawns.push({ start, free });
  }

  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p]!;
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1, captureReady: false, name: villageNames[p * 2], capital: true, stock: { ...START_STOCK } };
    tileMap.get(axialKey(free))!.settlement = { owner: null, level: 1, captureReady: false, name: villageNames[p * 2 + 1] };
  }

  for (const tile of tileMap.values()) {
    const settlement = tile.settlement;
    if (!settlement) continue;
    const radius = settlement.level === 1 ? 1 : 2;
    for (const t of tilesInRange(tile, radius)) {
      const target = tileMap.get(axialKey(t));
      if (target) {
        claimTileForVillage(target, tile);
        target.terrain = BIOME_LAND[target.biome!];
      }
    }
  }

  let unitId = 0;
  for (const tile of tileMap.values()) {
    if (tile.settlement && tile.settlement.owner !== null) {
      tile.unit = makeUnit(tile.settlement.owner, UnitType.WARRIOR, tile.q, tile.r, {
        id: `w${unitId}`,
        spawnVillage: { q: tile.q, r: tile.r },
      });
      unitId++;
    }
  }

  bridgeIslandVillages([...tileMap.values()]);
  ensureStartVillagePaths([...tileMap.values()], spawns);

  const resourceReserved = new Set<string>();
  for (const tile of tileMap.values()) {
    if (tile.settlement) ensureResourceNearVillage(tileMap, tile, resourceReserved);
  }

  const map: GameMap = { radius, tiles: [...tileMap.values()], spawns };
  placeBonuses(map, () => rng.next());
  return map;
}
