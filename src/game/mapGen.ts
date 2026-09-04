import { allTiles, axialKey, hexDistance, hexNeighbors, ringOf, tilesInRange } from './hex';
import { generateVillageNames } from './names';
import { isForestType, isLandType, isMountainType, isWaterType, TileType } from './tileTypes';
import { Biome, BIOME_FOREST, BIOME_LAND, BIOME_MOUNTAIN, generateTerrain } from './biomes';
import { SeededRandom } from '../util/random';
import { makeUnit, type Unit } from './units';
import { claimTileForVillage } from './claim';
import { placeBonuses, type Bonus } from './bonus';

const WATER_BORDER = 1;
const FREE_VILLAGE_MAX_DIST = 7;

export interface Settlement {
  owner: number | null;
  level: number;
  captureReady: boolean;
  name?: string;
  capital?: boolean;
}

export type BridgeDir = 'nw' | 'ne' | 'we';
export interface Bridge {
  owner: number;
  dir: BridgeDir;
}

export interface Building {
  kind: 'sawmill' | 'mine' | 'port' | 'temple' | 'forestTemple';
  level: number;
  bornTurn?: number;
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
  roadOwner?: number | null;
  bridge?: Bridge | null;
  unit: Unit | null;
  ownedBy: number | null;
  claimedByVillage: { q: number; r: number } | null;
  exploredBy?: number[];
  bonus?: Bonus | null;
}

export interface Spawn {
  start: { q: number; r: number };
  free: { q: number; r: number };
}

export interface GameMap {
  radius: number;
  tiles: MapTile[];
  spawns: Spawn[];
}

export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return Math.round(11 / 1.5);
  if (playerCount === 3) return Math.round(12 / 1.5);
  if (playerCount === 4) return Math.round(14 / 1.5);
  if (playerCount === 5) return Math.round(15 / 1.5);
  if (playerCount === 6) return Math.round(16 / 1.5);
  throw new Error(`Unsupported player count: ${playerCount}`);
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

function ensureResourceNearVillage(
  tileMap: Map<string, MapTile>,
  village: MapTile,
  reserved: Set<string>,
): void {
  const claimedByThis = (t: MapTile): boolean => {
    const c = t.claimedByVillage;
    return c === null || (c.q === village.q && c.r === village.r);
  };
  const provide = (wanted: 'mountain' | 'forest'): void => {
    for (const n of tilesInRange(village, 2)) {
      if (hexDistance(n, village) < 1) continue;
      const t = tileMap.get(axialKey(n));
      if (!t || reserved.has(axialKey(n)) || t.settlement || !claimedByThis(t)) continue;
      const found = wanted === 'mountain' ? isMountainType(t.terrain) : isForestType(t.terrain);
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
      t.terrain = wanted === 'mountain' ? BIOME_MOUNTAIN[t.biome!] : BIOME_FOREST[t.biome!];
      reserved.add(axialKey(n));
      return;
    }
  };
  provide('mountain');
  provide('forest');
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

export function generateMap(playerCount: number, seed: number): GameMap {
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
    if (hexDistance({ q: 0, r: 0 }, tile) === radius) {
      tile.terrain = TileType.Water;
    }
  }

  const reserved = new Set<string>();
  const spawns: Spawn[] = [];
  const placedVillages: { q: number; r: number }[] = [];

  const isTooCloseToAnyVillage = (t: { q: number; r: number }): boolean =>
    placedVillages.some((v) => hexDistance(t, v) < 4);

  for (let p = 0; p < playerCount; p++) {
    const target = sectorCenterAngle(p, playerCount);
    const inSector = tiles.filter(
      (t) =>
        angleDiff(angleOf(t), target) < Math.PI / playerCount &&
        !(t.q === 0 && t.r === 0) &&
        hexDistance({ q: 0, r: 0 }, t) <= radius - 2,
    );
    const pickFrom = (arr: { q: number; r: number }[]): { q: number; r: number } => {
      const pool = arr.length > 0 ? arr : inSector;
      return pool[Math.floor(rng.next() * pool.length)]!;
    };
    let candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const start = pickFrom(candidates);
    for (const n of hexNeighbors(start)) reserved.add(axialKey(n));
    placedVillages.push(start);

    candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && !isTooCloseToAnyVillage(t),
    );
    const nearFree = candidates.filter((t) => hexDistance(t, start) <= FREE_VILLAGE_MAX_DIST);
    const free = pickFrom(nearFree.length > 0 ? nearFree : candidates);
    for (const n of hexNeighbors(free)) reserved.add(axialKey(n));
    placedVillages.push(free);

    spawns.push({ start, free });
  }

  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p]!;
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1, captureReady: false, name: villageNames[p * 2], capital: true };
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
      tile.unit = makeUnit(tile.settlement.owner, 'warrior', tile.q, tile.r, {
        id: `w${unitId}`,
        spawnVillage: { q: tile.q, r: tile.r },
      });
      unitId++;
    }
  }

  bridgeIslandVillages([...tileMap.values()]);

  const resourceReserved = new Set<string>();
  for (const tile of tileMap.values()) {
    if (tile.settlement) ensureResourceNearVillage(tileMap, tile, resourceReserved);
  }

  const map: GameMap = { radius, tiles: [...tileMap.values()], spawns };
  placeBonuses(map, () => rng.next());
  return map;
}
