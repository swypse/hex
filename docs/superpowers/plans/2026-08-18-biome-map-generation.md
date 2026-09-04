# Natural Biome Map Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace random terrain assignment with noise-driven natural map generation: Perlin height/temperature/rain maps, Whittaker-style biomes, per-biome tile types, and per-tile climate data.

**Architecture:** New `perlin.ts` (seeded 2D Perlin) + new `biomes.ts` (biome enum, names, biome→tile mappings, classification, `generateTerrain`). `tileTypes.ts` expands to 17 uniform per-biome types with pure classification helpers. `mapGen.ts` calls `generateTerrain` and overrides village areas to land.

**Tech Stack:** TypeScript, Vitest (`npm test`), `tsc --noEmit` typecheck.

## Global Constraints

- Design spec: `docs/superpowers/specs/2026-08-18-biome-map-generation-design.md`.
- No new runtime dependencies (hand-rolled Perlin noise).
- Deterministic for a fixed seed (existing test requirement).
- Water = lowest 15% of heights; mountains = highest 10% of heights.
- `biomeFor`: `temp < 0.45` → `rain < 0.45 ? Tundra : Taiga`; `temp > 0.55` → `rain < 0.45 ? Desert : Rainforest`; else `Grassland`.
- 17 tile types: 5 biomes × {land, forest, mountain} + `Water` + `Settlement`. Old names (`Land`, `Sand`, `Snow`, `ForestLand`, `ForestSand`, `ForestSnow`, `Mountain`) are removed.
- Per-tile `biome`, `temperature`, `rain`, `height` stored on every generated tile.
- Village tiles + radius-1 claimed neighbors forced to that biome's land type.
- Forest when tile rain ≥ that biome's median rain (non-water/non-mountain tiles only).
- No cleanup pass for isolated single tiles.
- All land/forest height `0.2`, mountains `1`, water `0`, settlement `0.2`.

---

### Task 1: Perlin noise module

**Files:**
- Create: `src/game/perlin.ts`
- Test: `tests/perlin.test.ts`

**Interfaces:**
- Produces: `createPerlin(seed: number): (x: number, y: number) => number` — returns a deterministic noise function returning values in `[0, 1]`.

- [ ] **Step 1: Write the failing test**

`tests/perlin.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createPerlin } from '../src/game/perlin';

describe('perlin noise', () => {
  it('is deterministic for the same seed', () => {
    const a = createPerlin(42);
    const b = createPerlin(42);
    for (const [x, y] of [[0.3, 0.7], [12.4, -5.2], [1, 1]] as [number, number][]) {
      expect(a(x, y)).toBe(b(x, y));
    }
  });

  it('returns values in [0, 1]', () => {
    const noise = createPerlin(7);
    for (let i = 0; i < 1000; i++) {
      const x = (i * 0.37) % 10;
      const y = (i * 0.91) % 10;
      const v = noise(x, y);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('produces different outputs for different seeds', () => {
    const a = createPerlin(1);
    const b = createPerlin(2);
    expect(a(3.5, 2.5)).not.toBe(b(3.5, 2.5));
  });

  it('is smooth: nearby points have close values', () => {
    const noise = createPerlin(99);
    const center = noise(5.5, 5.5);
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        expect(Math.abs(noise(5.5 + dx, 5.5 + dy) - center)).toBeLessThan(0.5);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/perlin.test.ts`
Expected: FAIL — module not found / `createPerlin` not defined.

- [ ] **Step 3: Write minimal implementation**

`src/game/perlin.ts`:

```ts
import { SeededRandom } from '../util/random';

function makePermutation(seed: number): number[] {
  const rng = new SeededRandom(seed);
  const base = Array.from({ length: 256 }, (_, i) => i);
  const shuffled = rng.shuffle(base);
  return [...shuffled, ...shuffled];
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

function grad(hash: number, x: number, y: number): number {
  const h = hash & 7;
  const u = h < 4 ? x : y;
  const v = h < 4 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

export function createPerlin(seed: number): (x: number, y: number) => number {
  const perm = makePermutation(seed);
  return (x, y) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[xi] + yi];
    const ab = perm[perm[xi] + yi + 1];
    const ba = perm[perm[xi + 1] + yi];
    const bb = perm[perm[xi + 1] + yi + 1];
    const value = lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
    return (value + 1) / 2;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/perlin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/perlin.ts tests/perlin.test.ts
git commit -m "feat: add seeded 2D perlin noise"
```

---

### Task 2: Per-biome tile types + downstream updates

Replaces the 9 old terrain-based types with 17 uniform per-biome types and fixes every consumer so the repo compiles and the suite stays green.

**Files:**
- Modify: `src/game/tileTypes.ts` (whole file)
- Modify: `src/game/capture.ts:20-30` (tileResourceYield)
- Modify: `src/game/mapGen.ts:3,131-173` (imports + placeholder terrain)
- Test: `tests/tileTypes.test.ts`
- Test: `tests/capture.test.ts`
- Test: `tests/mapGen.test.ts`
- Test (fixture updates only): `tests/territory.test.ts`, `tests/claim.test.ts`, `tests/spawn.test.ts`, `tests/ai.test.ts`, `tests/village.test.ts`, `tests/combat.test.ts`, `tests/selection.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `enum TileType` with 17 members: `GrasslandLand`, `GrasslandForest`, `GrasslandMountain`, `DesertLand`, `DesertForest`, `DesertMountain`, `TundraLand`, `TundraForest`, `TundraMountain`, `TaigaLand`, `TaigaForest`, `TaigaMountain`, `RainforestLand`, `RainforestForest`, `RainforestMountain`, `Water`, `Settlement`.
  - `ALL_TILE_TYPES: TileType[]` (all 17)
  - `TILE_TYPE_COLORS`, `TILE_TYPE_NAMES`, `TERRAIN_HEIGHT: Record<TileType, ...>`
  - `isLandType(t): boolean`, `isForestType(t): boolean`, `isMountainType(t): boolean`, `isWaterType(t): boolean`

- [ ] **Step 1: Write/replace the failing test**

Replace `tests/tileTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_TILE_TYPES,
  isForestType,
  isLandType,
  isMountainType,
  isWaterType,
  TERRAIN_HEIGHT,
  TILE_TYPE_COLORS,
  TILE_TYPE_NAMES,
  TileType,
} from '../src/game/tileTypes';

describe('tile types', () => {
  it('defines all 17 tile types', () => {
    expect(ALL_TILE_TYPES).toHaveLength(17);
    expect(ALL_TILE_TYPES).toContain(TileType.Water);
    expect(ALL_TILE_TYPES).toContain(TileType.Settlement);
  });

  it('assigns a numeric color to every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(typeof TILE_TYPE_COLORS[type]).toBe('number');
    }
  });

  it('defines a display name for every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(TILE_TYPE_NAMES[type]).toBeTruthy();
    }
    expect(TILE_TYPE_NAMES[TileType.Water]).toBe('Water');
  });

  it('classifies land, forest, mountain, and water correctly', () => {
    const land = ALL_TILE_TYPES.filter(isLandType);
    const forest = ALL_TILE_TYPES.filter(isForestType);
    const mountain = ALL_TILE_TYPES.filter(isMountainType);
    const water = ALL_TILE_TYPES.filter(isWaterType);
    expect(land).toHaveLength(5);
    expect(forest).toHaveLength(5);
    expect(mountain).toHaveLength(5);
    expect(water).toEqual([TileType.Water]);
  });

  it('TERRAIN_HEIGHT: water is 0, mountain is the max, all >= 0', () => {
    expect(TERRAIN_HEIGHT[TileType.Water]).toBe(0);
    const max = Math.max(...ALL_TILE_TYPES.map((t) => TERRAIN_HEIGHT[t]));
    const mountains = ALL_TILE_TYPES.filter(isMountainType);
    for (const m of mountains) expect(TERRAIN_HEIGHT[m]).toBe(max);
    for (const type of ALL_TILE_TYPES) {
      expect(TERRAIN_HEIGHT[type]).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tileTypes.test.ts`
Expected: FAIL — new members missing, helper functions undefined.

- [ ] **Step 3: Replace `src/game/tileTypes.ts`**

```ts
export enum TileType {
  GrasslandLand,
  GrasslandForest,
  GrasslandMountain,
  DesertLand,
  DesertForest,
  DesertMountain,
  TundraLand,
  TundraForest,
  TundraMountain,
  TaigaLand,
  TaigaForest,
  TaigaMountain,
  RainforestLand,
  RainforestForest,
  RainforestMountain,
  Water,
  Settlement,
}

export const ALL_TILE_TYPES: TileType[] = [
  TileType.GrasslandLand,
  TileType.GrasslandForest,
  TileType.GrasslandMountain,
  TileType.DesertLand,
  TileType.DesertForest,
  TileType.DesertMountain,
  TileType.TundraLand,
  TileType.TundraForest,
  TileType.TundraMountain,
  TileType.TaigaLand,
  TileType.TaigaForest,
  TileType.TaigaMountain,
  TileType.RainforestLand,
  TileType.RainforestForest,
  TileType.RainforestMountain,
  TileType.Water,
  TileType.Settlement,
];

const LAND_TYPES = [
  TileType.GrasslandLand,
  TileType.DesertLand,
  TileType.TundraLand,
  TileType.TaigaLand,
  TileType.RainforestLand,
];
const FOREST_TYPES = [
  TileType.GrasslandForest,
  TileType.DesertForest,
  TileType.TundraForest,
  TileType.TaigaForest,
  TileType.RainforestForest,
];
const MOUNTAIN_TYPES = [
  TileType.GrasslandMountain,
  TileType.DesertMountain,
  TileType.TundraMountain,
  TileType.TaigaMountain,
  TileType.RainforestMountain,
];

export function isLandType(t: TileType): boolean {
  return LAND_TYPES.includes(t);
}

export function isForestType(t: TileType): boolean {
  return FOREST_TYPES.includes(t);
}

export function isMountainType(t: TileType): boolean {
  return MOUNTAIN_TYPES.includes(t);
}

export function isWaterType(t: TileType): boolean {
  return t === TileType.Water;
}

export const TILE_TYPE_COLORS: Record<TileType, number> = {
  [TileType.GrasslandLand]: 0x4c9a3d,
  [TileType.GrasslandForest]: 0x2e6b24,
  [TileType.GrasslandMountain]: 0x8a8a8a,
  [TileType.DesertLand]: 0xe0c068,
  [TileType.DesertForest]: 0x9c8b3f,
  [TileType.DesertMountain]: 0xb89968,
  [TileType.TundraLand]: 0xf2f2f7,
  [TileType.TundraForest]: 0xbcd8bc,
  [TileType.TundraMountain]: 0xc8c8d0,
  [TileType.TaigaLand]: 0x4f8a5e,
  [TileType.TaigaForest]: 0x2f5a4a,
  [TileType.TaigaMountain]: 0x9aa0a8,
  [TileType.RainforestLand]: 0x3d8f4f,
  [TileType.RainforestForest]: 0x1f6b35,
  [TileType.RainforestMountain]: 0x6f8f7a,
  [TileType.Water]: 0x2f6fb3,
  [TileType.Settlement]: 0xd8c9a3,
};

export const TILE_TYPE_NAMES: Record<TileType, string> = {
  [TileType.GrasslandLand]: 'Grassland',
  [TileType.GrasslandForest]: 'Grassland forest',
  [TileType.GrasslandMountain]: 'Grassland mountains',
  [TileType.DesertLand]: 'Desert',
  [TileType.DesertForest]: 'Desert forest',
  [TileType.DesertMountain]: 'Desert mountains',
  [TileType.TundraLand]: 'Tundra',
  [TileType.TundraForest]: 'Tundra forest',
  [TileType.TundraMountain]: 'Tundra mountains',
  [TileType.TaigaLand]: 'Taiga',
  [TileType.TaigaForest]: 'Taiga forest',
  [TileType.TaigaMountain]: 'Taiga mountains',
  [TileType.RainforestLand]: 'Rainforest',
  [TileType.RainforestForest]: 'Rainforest forest',
  [TileType.RainforestMountain]: 'Rainforest mountains',
  [TileType.Water]: 'Water',
  [TileType.Settlement]: 'Settlement',
};

export const TERRAIN_HEIGHT: Record<TileType, number> = {
  [TileType.GrasslandLand]: 0.2,
  [TileType.GrasslandForest]: 0.2,
  [TileType.GrasslandMountain]: 1,
  [TileType.DesertLand]: 0.2,
  [TileType.DesertForest]: 0.2,
  [TileType.DesertMountain]: 1,
  [TileType.TundraLand]: 0.2,
  [TileType.TundraForest]: 0.2,
  [TileType.TundraMountain]: 1,
  [TileType.TaigaLand]: 0.2,
  [TileType.TaigaForest]: 0.2,
  [TileType.TaigaMountain]: 1,
  [TileType.RainforestLand]: 0.2,
  [TileType.RainforestForest]: 0.2,
  [TileType.RainforestMountain]: 1,
  [TileType.Water]: 0,
  [TileType.Settlement]: 0.2,
};
```

- [ ] **Step 4: Update `src/game/capture.ts`**

Replace lines 1-30:

```ts
import { GameMap, MapTile } from './mapGen';
import { Player } from './players';
import { isForestType, isMountainType } from './tileTypes';
import { Unit } from './units';
import { villageCapacity, unitsInVillage } from './village';
```

and

```ts
export function tileResourceYield(tile: MapTile): { wood: number; stone: number } {
  if (isForestType(tile.terrain)) return { wood: 1, stone: 0 };
  if (isMountainType(tile.terrain)) return { wood: 0, stone: 1 };
  return { wood: 0, stone: 0 };
}
```

- [ ] **Step 5: Update `src/game/mapGen.ts` (placeholder)**

- Change line 3 import to `import { TileType } from './tileTypes';` (drop `TERRAIN_TYPES`, `WEIGHTED_TERRAIN`).
- Change the initial terrain at the tile-map creation to `terrain: TileType.GrasslandLand`.
- Replace the final terrain block (currently `tile.terrain = rng.pick(TERRAIN_TYPES)` / `rng.pick(WEIGHTED_TERRAIN)`, lines ~165-173) with a placeholder:

```ts
  for (const tile of tileMap.values()) {
    tile.terrain = TileType.GrasslandLand;
  }
```

This placeholder is replaced by real noise generation in Task 4.

- [ ] **Step 6: Update remaining test files**

Replace the old tile type references in these files (no `Sand`/`Snow` references exist in tests; only `Land` and `Mountain` do):

- `tests/capture.test.ts` — fixtures: `TileType.Land` → `TileType.GrasslandLand`; `TileType.ForestLand` → `TileType.GrasslandForest`; `TileType.ForestSand` → `TileType.DesertForest`; `TileType.ForestSnow` → `TileType.TundraForest`; `TileType.Mountain` → `TileType.GrasslandMountain`.
- `tests/territory.test.ts`, `tests/claim.test.ts`, `tests/spawn.test.ts`, `tests/ai.test.ts`, `tests/village.test.ts`, `tests/combat.test.ts`, `tests/selection.test.ts` — `TileType.Land` → `TileType.GrasslandLand` in the `makeTile` helpers (and `tests/combat.test.ts` line 23 stays `TileType.Water`, unchanged).

Update `tests/mapGen.test.ts`:
- Line 4 import → `import { isLandType, TileType } from '../src/game/tileTypes';`
- The "keeps a land-ish terrain type under every settlement" test → use `expect(isLandType(s.terrain)).toBe(true)` instead of `expect(TERRAIN_TYPES).toContain(s.terrain)`.

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add src/game/tileTypes.ts src/game/capture.ts src/game/mapGen.ts tests/
git commit -m "feat: expand tile types to per-biome land/forest/mountain"
```

---

### Task 3: Biome module

**Files:**
- Create: `src/game/biomes.ts`
- Test: `tests/biomes.test.ts`

**Interfaces:**
- Consumes: `TileType` + `isLandType/isForestType/isMountainType` from `tileTypes.ts`; `hexToPixel` from `hex.ts`; `createPerlin` from `perlin.ts`.
- Produces:
  - `enum Biome { Grassland, Desert, Tundra, Taiga, Rainforest }`
  - `BIOME_NAMES: Record<Biome, string>`
  - `BIOME_LAND: Record<Biome, TileType>` (grassland/desert/tundra/taiga/rainforest → the 5 land types)
  - `BIOME_FOREST: Record<Biome, TileType>`
  - `BIOME_MOUNTAIN: Record<Biome, TileType>`
  - `biomeFor(temperature: number, rain: number): Biome`
  - `generateTerrain(tiles: TerrainTile[], seed: number): void` where `TerrainTile = { q: number; r: number; terrain: TileType; height?: number; temperature?: number; rain?: number; biome?: Biome }`. Mutates each tile in place: sets `height`, `temperature`, `rain`, `biome`, then derives `terrain`. `MapTile` (Task 4) is structurally assignable to it, so `biomes.ts` does not import `mapGen.ts`.

- [ ] **Step 1: Write the failing test**

`tests/biomes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BIOME_FOREST,
  BIOME_LAND,
  BIOME_MOUNTAIN,
  BIOME_NAMES,
  Biome,
  biomeFor,
  generateTerrain,
} from '../src/game/biomes';
import { isForestType, isLandType, isMountainType, TileType } from '../src/game/tileTypes';

describe('biomes', () => {
  it('classifies temperature and rain into all five biomes', () => {
    expect(biomeFor(0.3, 0.3)).toBe(Biome.Tundra);
    expect(biomeFor(0.3, 0.7)).toBe(Biome.Taiga);
    expect(biomeFor(0.7, 0.3)).toBe(Biome.Desert);
    expect(biomeFor(0.7, 0.7)).toBe(Biome.Rainforest);
    expect(biomeFor(0.5, 0.5)).toBe(Biome.Grassland);
    expect(biomeFor(0.5, 0.3)).toBe(Biome.Grassland);
    expect(biomeFor(0.5, 0.7)).toBe(Biome.Grassland);
  });

  it('has a display name for every biome', () => {
    for (const b of Object.values(Biome).filter((v): v is Biome => typeof v === 'number')) {
      expect(typeof BIOME_NAMES[b]).toBe('string');
    }
  });

  it('maps every biome to a land, forest, and mountain tile', () => {
    for (const b of Object.values(Biome).filter((v): v is Biome => typeof v === 'number')) {
      expect(isLandType(BIOME_LAND[b])).toBe(true);
      expect(isForestType(BIOME_FOREST[b])).toBe(true);
      expect(isMountainType(BIOME_MOUNTAIN[b])).toBe(true);
    }
  });

  it('sets height, temperature, rain, biome, and terrain for every tile', () => {
    const tiles = Array.from({ length: 200 }, (_, i) => ({
      q: i % 20,
      r: Math.floor(i / 20),
      terrain: TileType.GrasslandLand,
    }));
    generateTerrain(tiles, 42);
    for (const t of tiles) {
      expect(typeof t.height).toBe('number');
      expect(t.height!).toBeGreaterThanOrEqual(0);
      expect(t.height!).toBeLessThanOrEqual(1);
      expect(typeof t.temperature).toBe('number');
      expect(typeof t.rain).toBe('number');
      expect(typeof t.biome).toBe('number');
      expect(typeof t.terrain).toBe('number');
    }
  });

  it('is deterministic for a fixed seed', () => {
    const make = (): { q: number; r: number; terrain: TileType }[] =>
      Array.from({ length: 100 }, (_, i) => ({ q: i % 10, r: Math.floor(i / 10), terrain: TileType.GrasslandLand }));
    const a = make();
    const b = make();
    generateTerrain(a, 7);
    generateTerrain(b, 7);
    expect(a.map((t) => [t.height, t.temperature, t.rain, t.biome, t.terrain])).toEqual(
      b.map((t) => [t.height, t.temperature, t.rain, t.biome, t.terrain]),
    );
  });

  it('produces roughly 15% water and 10% mountains on a large map', () => {
    const tiles = Array.from({ length: 1200 }, (_, i) => ({
      q: (i * 13) % 60,
      r: Math.floor((i * 13) % 60 / 2),
      terrain: TileType.GrasslandLand,
    }));
    generateTerrain(tiles, 123);
    const water = tiles.filter((t) => t.terrain === TileType.Water).length / tiles.length;
    const mountain = tiles.filter((t) => isMountain(t.terrain)).length / tiles.length;
    expect(water).toBeGreaterThan(0.1);
    expect(water).toBeLessThan(0.2);
    expect(mountain).toBeGreaterThan(0.05);
    expect(mountain).toBeLessThan(0.15);
  });
});

function isMountain(t: TileType): boolean {
  return [
    TileType.GrasslandMountain,
    TileType.DesertMountain,
    TileType.TundraMountain,
    TileType.TaigaMountain,
    TileType.RainforestMountain,
  ].includes(t);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/biomes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/game/biomes.ts`**

```ts
import { hexToPixel } from './hex';
import { TileType } from './tileTypes';
import { createPerlin } from './perlin';

export enum Biome {
  Grassland,
  Desert,
  Tundra,
  Taiga,
  Rainforest,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Grassland]: 'Grassland',
  [Biome.Desert]: 'Desert',
  [Biome.Tundra]: 'Tundra',
  [Biome.Taiga]: 'Taiga',
  [Biome.Rainforest]: 'Rainforest',
};

export const BIOME_LAND: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandLand,
  [Biome.Desert]: TileType.DesertLand,
  [Biome.Tundra]: TileType.TundraLand,
  [Biome.Taiga]: TileType.TaigaLand,
  [Biome.Rainforest]: TileType.RainforestLand,
};

export const BIOME_FOREST: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandForest,
  [Biome.Desert]: TileType.DesertForest,
  [Biome.Tundra]: TileType.TundraForest,
  [Biome.Taiga]: TileType.TaigaForest,
  [Biome.Rainforest]: TileType.RainforestForest,
};

export const BIOME_MOUNTAIN: Record<Biome, TileType> = {
  [Biome.Grassland]: TileType.GrasslandMountain,
  [Biome.Desert]: TileType.DesertMountain,
  [Biome.Tundra]: TileType.TundraMountain,
  [Biome.Taiga]: TileType.TaigaMountain,
  [Biome.Rainforest]: TileType.RainforestMountain,
};

const TEMP_COLD = 0.45;
const TEMP_WARM = 0.55;
const RAIN_DRY = 0.45;

export function biomeFor(temperature: number, rain: number): Biome {
  if (temperature < TEMP_COLD) return rain < RAIN_DRY ? Biome.Tundra : Biome.Taiga;
  if (temperature > TEMP_WARM) return rain < RAIN_DRY ? Biome.Desert : Biome.Rainforest;
  return Biome.Grassland;
}

const HEIGHT_FREQ = 0.15;
const TEMP_FREQ = 0.08;
const RAIN_FREQ = 0.1;

export interface TerrainTile {
  q: number;
  r: number;
  terrain: TileType;
  height?: number;
  temperature?: number;
  rain?: number;
  biome?: Biome;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.floor((sorted.length - 1) * p)];
}

export function generateTerrain(tiles: TerrainTile[], seed: number): void {
  const heightNoise = createPerlin(seed);
  const tempNoise = createPerlin(seed + 1);
  const rainNoise = createPerlin(seed + 2);

  for (const t of tiles) {
    const p = hexToPixel(t, 1);
    t.height = heightNoise(p.x * HEIGHT_FREQ, p.y * HEIGHT_FREQ);
    t.temperature = tempNoise(p.x * TEMP_FREQ, p.y * TEMP_FREQ);
    t.rain = rainNoise(p.x * RAIN_FREQ, p.y * RAIN_FREQ);
    t.biome = biomeFor(t.temperature, t.rain);
  }

  const heights = tiles.map((t) => t.height!).sort((a, b) => a - b);
  const waterThreshold = percentile(heights, 0.15);
  const mountainThreshold = percentile(heights, 0.9);

  const allBiomes = Object.values(Biome).filter((v): v is Biome => typeof v === 'number');
  const rainMedians = new Map<Biome, number>();
  for (const b of allBiomes) {
    const rains = tiles
      .filter((t) => t.biome === b && t.height! >= waterThreshold && t.height! < mountainThreshold)
      .map((t) => t.rain!)
      .sort((a, b) => a - b);
    if (rains.length === 0) continue;
    rainMedians.set(b, percentile(rains, 0.5));
  }

  for (const t of tiles) {
    if (t.height! < waterThreshold) {
      t.terrain = TileType.Water;
    } else if (t.height! >= mountainThreshold) {
      t.terrain = BIOME_MOUNTAIN[t.biome!];
    } else {
      const median = rainMedians.get(t.biome!);
      t.terrain = median !== undefined && t.rain! >= median ? BIOME_FOREST[t.biome!] : BIOME_LAND[t.biome!];
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/biomes.test.ts`
Expected: PASS.

Note: the "roughly 15% water" test samples a 60×~30 world grid with wrap-around coordinates — if it ever flakes, replace the coordinate generation with a wider spread, e.g. `q: (i % 60) - 30, r: Math.floor(i / 60) - 15`.

- [ ] **Step 5: Commit**

```bash
git add src/game/biomes.ts tests/biomes.test.ts
git commit -m "feat: add biome classification and terrain generation"
```

---

### Task 4: Integrate terrain generation into map generation

**Files:**
- Modify: `src/game/mapGen.ts`
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: `generateTerrain` + `BIOME_LAND` + `Biome` from `biomes.ts`; `isLandType` from `tileTypes.ts`.
- Produces: `MapTile` gains `biome?: Biome; temperature?: number; rain?: number; height?: number`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/mapGen.test.ts` (after the existing determinism test):

```ts
  it('stores climate data and a biome on every tile', () => {
    const map = generateMap(2, 42);
    for (const t of map.tiles) {
      expect(t.biome).toBeDefined();
      expect(typeof t.temperature).toBe('number');
      expect(typeof t.rain).toBe('number');
      expect(typeof t.height).toBe('number');
    }
  });

  it('produces roughly 15% water and 10% mountains', () => {
    const map = generateMap(3, 42);
    const water = map.tiles.filter((t) => t.terrain === TileType.Water).length / map.tiles.length;
    const mountain = map.tiles.filter((t) => t.terrain === TileType.GrasslandMountain || t.terrain === TileType.DesertMountain || t.terrain === TileType.TundraMountain || t.terrain === TileType.TaigaMountain || t.terrain === TileType.RainforestMountain).length / map.tiles.length;
    expect(water).toBeGreaterThan(0.1);
    expect(water).toBeLessThan(0.2);
    expect(mountain).toBeGreaterThan(0.05);
    expect(mountain).toBeLessThan(0.15);
  });

  it('keeps every village and its radius-1 area on land', () => {
    const map = generateMap(3, 42);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    const settlements = map.tiles.filter((t) => t.settlement !== null);
    for (const s of settlements) {
      expect(isLandType(s.terrain)).toBe(true);
      for (const n of hexNeighbors(s)) {
        const neighbor = byKey.get(axialKey(n));
        if (neighbor) expect(isLandType(neighbor.terrain)).toBe(true);
      }
    }
  });
```

Imports already present in the test: add `isLandType` to the `tileTypes` import (line 4).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/mapGen.test.ts`
Expected: the three new tests FAIL (MapTile has no `biome`, terrain is the placeholder).

- [ ] **Step 3: Modify `src/game/mapGen.ts`**

1. Imports — add biome imports:

```ts
import { Biome, BIOME_LAND, generateTerrain } from './biomes';
```

2. `MapTile` interface — add the four fields:

```ts
export interface MapTile {
  q: number;
  r: number;
  terrain: TileType;
  biome?: Biome;
  temperature?: number;
  rain?: number;
  height?: number;
  settlement: Settlement | null;
  unit: Unit | null;
  ownedBy: number | null;
  claimedByVillage: { q: number; r: number } | null;
  resourceCollected?: boolean;
}
```

3. Call `generateTerrain` right after the tile-map loop that initializes tiles (before the `reserved`/spawn section):

```ts
  generateTerrain([...tileMap.values()], seed);
```

4. Delete the placeholder terrain block (the `for (const tile of tileMap.values()) { tile.terrain = TileType.GrasslandLand; }` loop from Task 2).

5. In the settlement claim loop, force the claimed area to land:

```ts
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
```

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: ALL PASS, typecheck clean.

- [ ] **Step 5: Manual visual check**

Run: `npm run dev`, start a game, and confirm: connected water/mountain/forest regions, villages on land, biome-colored tiles.

- [ ] **Step 6: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: generate natural biome terrain via noise"
```
