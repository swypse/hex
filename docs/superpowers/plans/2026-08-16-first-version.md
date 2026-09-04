# First Playable Version (Start, Setup, Game Screens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A runnable three-screen hex strategy game: start screen → setup screen → game screen with a generated hex map (PixiJS sprites) and a players list.

**Architecture:** Vite + TypeScript + PixiJS v8. Pure game logic (hex math, map generation, players) lives in `src/game` and is unit-tested with Vitest. Rendering (`src/render`) turns tiles into sprites from generated textures. Screens are plain HTML `<div>`s toggled by a small router in `src/main.ts`; the game screen holds the PixiJS canvas and an HTML players list overlay.

**Tech Stack:** Vite 5, TypeScript 5, PixiJS 8, Vitest 1, Node ≥ 18 (dev machine has 19.3.0).

## Global Constraints

- TypeScript `strict: true`, module `ESNext`, `moduleResolution: "Bundler"`, no emit (Vite handles build).
- Do NOT add code comments unless a step shows one explicitly.
- Tile type count is exactly 9; tribe count exactly 3.
- Map radius: 4 for 2 players, 5 for 3 players. Hex map shape = center + rings.
- Settlement placement: wedge sectors, starting village + one free (neutral, owner `null`) village per player, every village's 6-neighbor ring settlement-free.
- Pointy-top hexagons for rendering.
- Tests run with `npm test` (`vitest run`).
- Commit after each task with the exact message shown.

---

### Task 1: Project scaffold (Vite + TS + PixiJS + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `tests/example.test.ts` (deleted in Task 2)
- Test: `npm test`, `npm run typecheck`, `npm run dev`

**Interfaces:**
- Consumes: nothing.
- Produces: working Vite dev server, `npm test` and `npm run typecheck` scripts, a git repo, and an `index.html` shell with three screen containers that later tasks wire up.

- [ ] **Step 1: Initialize git and write `.gitignore`**

```bash
cd /home/user/games/hex && git init
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
```

- [ ] **Step 2: Replace `package.json`**

Current `package.json` has an empty `test` script. Replace its contents entirely with:

```json
{
  "name": "hex",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Install dependencies**

Run:

```bash
npm install pixi.js
npm install -D typescript@^5 vite@^5 vitest@^1
```

Expected: installs succeed, `node_modules/` and `package-lock.json` appear.

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": [],
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "esModuleInterop": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 5: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hex</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: #1a1a2e; color: #eee; font-family: system-ui, sans-serif; }
    .screen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
    .hidden { display: none !important; }
    button { font-size: 16px; padding: 8px 16px; cursor: pointer; border-radius: 4px; border: none; }
    #game-root { position: absolute; inset: 0; }
    #players-list { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="screen-start" class="screen">
    <h1>Hex</h1>
    <button id="start-btn">Start</button>
  </div>
  <div id="screen-setup" class="screen hidden">
    <h2>Choose your tribe</h2>
    <div id="tribe-select"></div>
    <h2>Enemies</h2>
    <div id="enemy-select"></div>
    <button id="setup-start-btn">Start</button>
  </div>
  <div id="screen-game" class="screen hidden">
    <div id="game-root"></div>
    <div id="players-list"></div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

Note: `src/main.ts` doesn't exist yet — that's fine for Task 1 verification (see Step 8).

- [ ] **Step 7: Create `tests/example.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs a test', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Verify scripts work**

Run: `npm test`
Expected: PASS (1 test).

Run: `npm run typecheck`
Expected: no errors (no `.ts` files under `src` yet; `tests/example.test.ts` and `vite.config.ts` typecheck clean).

Run: `npm run dev` then press Ctrl+C.
Expected: Vite prints a local server URL (dev server works; browser shows a 404/blank page because `src/main.ts` is missing — acceptable here).

- [ ] **Step 9: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json vite.config.ts index.html tests/example.test.ts
git commit -m "chore: scaffold vite + typescript + pixijs + vitest"
```

---

### Task 2: Seeded random utility

**Files:**
- Create: `src/util/random.ts`
- Test: `tests/random.test.ts` (replaces `tests/example.test.ts` — delete the example)

**Interfaces:**
- Consumes: nothing.
- Produces: `class SeededRandom { constructor(seed: number); next(): number; int(min: number, max: number): number; pick<T>(arr: T[]): T; shuffle<T>(arr: T[]): T[] }` — deterministic, seed-based (mulberry32). `next()` returns floats in `[0, 1)`.

- [ ] **Step 1: Delete the example test and write the failing test**

```bash
rm /home/user/games/hex/tests/example.test.ts
```

Create `tests/random.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SeededRandom } from '../src/util/random';

describe('SeededRandom', () => {
  it('is deterministic for the same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int returns values within inclusive bounds', () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 100; i++) {
      const v = rng.int(1, 3);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('pick returns an element of the array', () => {
    const rng = new SeededRandom(7);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(rng.pick(arr));
    }
  });

  it('shuffle preserves all elements', () => {
    const rng = new SeededRandom(7);
    const arr = [1, 2, 3, 4, 5];
    const shuffled = rng.shuffle([...arr]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(arr);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/util/random'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/util/random.ts`:

```ts
export class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (this.seed + 0x6d2b79f5) | 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (5 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/util/random.ts tests/random.test.ts
git commit -m "feat: add seeded random utility"
```

---

### Task 3: Hex math

**Files:**
- Create: `src/game/hex.ts`
- Test: `tests/hex.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface Axial { q: number; r: number }`
  - `axialKey(h: Axial): string` → `"q,r"`
  - `hexNeighbors(h: Axial): Axial[]` → 6 tiles
  - `hexDistance(a: Axial, b: Axial): number`
  - `ringOf(center: Axial, radius: number): Axial[]` → tiles at exactly `radius`
  - `tilesInRange(center: Axial, radius: number): Axial[]`
  - `allTiles(mapRadius: number): Axial[]` → full hex map (radius 4 → 61 tiles, radius 5 → 91)
  - `hexToPixel(h: Axial, hexSize: number): { x: number; y: number }` → pointy-top offset

- [ ] **Step 1: Write the failing test**

Create `tests/hex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  allTiles,
  axialKey,
  hexDistance,
  hexNeighbors,
  hexToPixel,
  ringOf,
  tilesInRange,
} from '../src/game/hex';

describe('hex math', () => {
  it('computes distance for adjacent tiles', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });

  it('hexDistance is symmetric', () => {
    const a = { q: 2, r: -1 };
    const b = { q: -1, r: 1 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('returns 6 unique neighbors', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
    expect(new Set(neighbors.map(axialKey)).size).toBe(6);
  });

  it('ringOf returns tiles at exact distance', () => {
    const center = { q: 0, r: 0 };
    const ring = ringOf(center, 2);
    expect(ring).toHaveLength(12);
    for (const tile of ring) {
      expect(hexDistance(center, tile)).toBe(2);
    }
  });

  it('tilesInRange includes center and ring', () => {
    expect(tilesInRange({ q: 0, r: 0 }, 2)).toHaveLength(19);
  });

  it('allTiles produces 3R(R+1)+1 tiles', () => {
    expect(allTiles(4)).toHaveLength(61);
    expect(allTiles(5)).toHaveLength(91);
  });

  it('hexToPixel maps distinct hexes to distinct pixels', () => {
    const a = hexToPixel({ q: 0, r: 0 }, 40);
    const b = hexToPixel({ q: 1, r: 0 }, 40);
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/hex'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/hex.ts`:

```ts
export interface Axial {
  q: number;
  r: number;
}

export function axialKey(h: Axial): string {
  return `${h.q},${h.r}`;
}

const NEIGHBOR_DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(h: Axial): Axial[] {
  return NEIGHBOR_DIRECTIONS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  return (
    (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2
  );
}

export function ringOf(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [];
  let q = center.q + radius;
  let r = center.r;
  for (let i = 0; i < 6; i++) {
    const dir = NEIGHBOR_DIRECTIONS[i];
    for (let j = 0; j < radius; j++) {
      result.push({ q, r });
      q += dir.q;
      r += dir.r;
    }
  }
  return result;
}

export function tilesInRange(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      result.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return result;
}

export function allTiles(mapRadius: number): Axial[] {
  return tilesInRange({ q: 0, r: 0 }, mapRadius);
}

export function hexToPixel(h: Axial, hexSize: number): { x: number; y: number } {
  const x = hexSize * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r);
  const y = hexSize * ((3 / 2) * h.r);
  return { x, y };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (7 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: add hex math utilities"
```

---

### Task 4: Tile types, tribes, players

**Files:**
- Create: `src/game/tileTypes.ts`
- Create: `src/game/tribes.ts`
- Create: `src/game/players.ts`
- Test: `tests/tileTypes.test.ts`, `tests/players.test.ts`

**Interfaces:**
- Consumes: nothing (players.ts consumes tribes.ts).
- Produces:
  - `enum TileType { Land, Sand, Snow, ForestLand, ForestSand, ForestSnow, Water, Mountain, Settlement }`
  - `ALL_TILE_TYPES: TileType[]` (all 9)
  - `TERRAIN_TYPES: TileType[]` (the 6 non-settlement terrain types)
  - `TILE_TYPE_COLORS: Record<TileType, number>`
  - `WEIGHTED_TERRAIN: TileType[]` (terrain with water/mountain under-weighted)
  - `enum Tribe { Villagers, Warriors, Barbarians }`
  - `interface TribeInfo { id: Tribe; name: string; color: number }`
  - `TRIBES: TribeInfo[]` (Villagers brown `0x8b5a2b`, Warriors orange `0xe07b22`, Barbarians red `0xc0392b`)
  - `interface Player { index: number; tribe: Tribe; isHuman: boolean }`
  - `buildPlayers(humanTribe: Tribe, enemyCount: number): Player[]` — throws for enemyCount outside `1..2`; AI tribes are the remaining distinct tribes.

- [ ] **Step 1: Write the failing tests**

Create `tests/tileTypes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_TILE_TYPES,
  TERRAIN_TYPES,
  TILE_TYPE_COLORS,
  TileType,
  WEIGHTED_TERRAIN,
} from '../src/game/tileTypes';

describe('tile types', () => {
  it('defines all 9 tile types', () => {
    expect(ALL_TILE_TYPES).toHaveLength(9);
    expect(ALL_TILE_TYPES).toContain(TileType.Settlement);
  });

  it('assigns a numeric color to every tile type', () => {
    for (const type of ALL_TILE_TYPES) {
      expect(typeof TILE_TYPE_COLORS[type]).toBe('number');
    }
  });

  it('TERRAIN_TYPES excludes Settlement', () => {
    expect(TERRAIN_TYPES).toHaveLength(6);
    expect(TERRAIN_TYPES).not.toContain(TileType.Settlement);
  });

  it('WEIGHTED_TERRAIN contains every terrain type at least once', () => {
    for (const type of TERRAIN_TYPES) {
      expect(WEIGHTED_TERRAIN).toContain(type);
    }
  });
});
```

Create `tests/players.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Tribe } from '../src/game/tribes';
import { buildPlayers } from '../src/game/players';

describe('buildPlayers', () => {
  it('creates a human player and 1 AI with a distinct tribe', () => {
    const players = buildPlayers(Tribe.Villagers, 1);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ tribe: Tribe.Villagers, isHuman: true });
    expect(players[1].isHuman).toBe(false);
    expect(players[1].tribe).not.toBe(Tribe.Villagers);
  });

  it('creates 3 players with distinct tribes for 2 enemies', () => {
    const players = buildPlayers(Tribe.Warriors, 2);
    expect(players).toHaveLength(3);
    expect(new Set(players.map((p) => p.tribe)).size).toBe(3);
  });

  it('throws for invalid enemy counts', () => {
    expect(() => buildPlayers(Tribe.Villagers, 0)).toThrow();
    expect(() => buildPlayers(Tribe.Villagers, 3)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write minimal implementations**

Create `src/game/tileTypes.ts`:

```ts
export enum TileType {
  Land,
  Sand,
  Snow,
  ForestLand,
  ForestSand,
  ForestSnow,
  Water,
  Mountain,
  Settlement,
}

export const ALL_TILE_TYPES: TileType[] = [
  TileType.Land,
  TileType.Sand,
  TileType.Snow,
  TileType.ForestLand,
  TileType.ForestSand,
  TileType.ForestSnow,
  TileType.Water,
  TileType.Mountain,
  TileType.Settlement,
];

export const TERRAIN_TYPES: TileType[] = [
  TileType.Land,
  TileType.Sand,
  TileType.Snow,
  TileType.ForestLand,
  TileType.ForestSand,
  TileType.ForestSnow,
];

export const TILE_TYPE_COLORS: Record<TileType, number> = {
  [TileType.Land]: 0x4c9a3d,
  [TileType.Sand]: 0xe0c068,
  [TileType.Snow]: 0xf2f2f7,
  [TileType.ForestLand]: 0x2e6b24,
  [TileType.ForestSand]: 0x9c8b3f,
  [TileType.ForestSnow]: 0xbcd8bc,
  [TileType.Water]: 0x2f6fb3,
  [TileType.Mountain]: 0x8a8a8a,
  [TileType.Settlement]: 0xd8c9a3,
};

export const WEIGHTED_TERRAIN: TileType[] = [
  TileType.Land, TileType.Land, TileType.Land, TileType.Land,
  TileType.Sand, TileType.Sand,
  TileType.Snow, TileType.Snow,
  TileType.ForestLand, TileType.ForestLand, TileType.ForestLand,
  TileType.ForestSand, TileType.ForestSand,
  TileType.ForestSnow, TileType.ForestSnow,
  TileType.Water, TileType.Water,
  TileType.Mountain,
];
```

Create `src/game/tribes.ts`:

```ts
export enum Tribe {
  Villagers,
  Warriors,
  Barbarians,
}

export interface TribeInfo {
  id: Tribe;
  name: string;
  color: number;
}

export const TRIBES: TribeInfo[] = [
  { id: Tribe.Villagers, name: 'Villagers', color: 0x8b5a2b },
  { id: Tribe.Warriors, name: 'Warriors', color: 0xe07b22 },
  { id: Tribe.Barbarians, name: 'Barbarians', color: 0xc0392b },
];
```

Create `src/game/players.ts`:

```ts
import { Tribe, TRIBES } from './tribes';

export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
}

export function buildPlayers(humanTribe: Tribe, enemyCount: number): Player[] {
  if (enemyCount < 1 || enemyCount > 2) {
    throw new Error(`Enemy count must be 1 or 2, got ${enemyCount}`);
  }
  const enemyTribes = TRIBES.filter((t) => t.id !== humanTribe)
    .map((t) => t.id)
    .slice(0, enemyCount);
  const players: Player[] = [{ index: 0, tribe: humanTribe, isHuman: true }];
  for (const tribe of enemyTribes) {
    players.push({ index: players.length, tribe, isHuman: false });
  }
  return players;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (7 tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/tileTypes.ts src/game/tribes.ts src/game/players.ts tests/tileTypes.test.ts tests/players.test.ts
git commit -m "feat: add tile types, tribes, and player setup"
```

---

### Task 5: Map generation

**Files:**
- Create: `src/game/mapGen.ts`
- Test: `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: `hex.ts` (`allTiles`, `axialKey`, `hexDistance`, `hexNeighbors`, `hexToPixel`), `tileTypes.ts` (`TileType`, `TERRAIN_TYPES`, `WEIGHTED_TERRAIN`), `random.ts` (`SeededRandom`).
- Produces:
  - `interface MapTile { q: number; r: number; type: TileType; owner: number | null }` (`owner` = player index for starting settlements, `null` for free/neutral settlements, unused otherwise)
  - `interface Spawn { start: { q: number; r: number }; free: { q: number; r: number } }`
  - `interface GameMap { radius: number; tiles: MapTile[]; spawns: Spawn[] }`
  - `mapRadiusFor(playerCount: number): number` → 4 for 2, 5 for 3, throws otherwise
  - `generateMap(playerCount: number, seed: number): GameMap` — deterministic for a fixed seed

- [ ] **Step 1: Write the failing test**

Create `tests/mapGen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allTiles, axialKey, hexDistance, hexNeighbors } from '../src/game/hex';
import { generateMap, mapRadiusFor } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';

describe('map generation', () => {
  it('chooses radius by player count', () => {
    expect(mapRadiusFor(2)).toBe(4);
    expect(mapRadiusFor(3)).toBe(5);
    expect(() => mapRadiusFor(1)).toThrow();
    expect(() => mapRadiusFor(4)).toThrow();
  });

  it('generates the expected number of tiles', () => {
    const map = generateMap(2, 42);
    expect(map.tiles).toHaveLength(allTiles(4).length);
  });

  it('is deterministic for a fixed seed', () => {
    expect(generateMap(2, 42).tiles).toEqual(generateMap(2, 42).tiles);
  });

  it('places one owned settlement per player and one free settlement per player', () => {
    const map = generateMap(2, 42);
    const owned = map.tiles.filter((t) => t.type === TileType.Settlement && t.owner !== null);
    const free = map.tiles.filter((t) => t.type === TileType.Settlement && t.owner === null);
    expect(owned).toHaveLength(2);
    expect(free).toHaveLength(2);
    expect(new Set(owned.map((t) => t.owner))).toEqual(new Set([0, 1]));
  });

  it('has no settlement adjacent to another settlement', () => {
    const map = generateMap(3, 42);
    const settlements = map.tiles.filter((t) => t.type === TileType.Settlement);
    const byKey = new Map(map.tiles.map((t) => [axialKey(t), t]));
    for (const s of settlements) {
      for (const n of hexNeighbors(s)) {
        expect(byKey.get(axialKey(n))?.type).not.toBe(TileType.Settlement);
      }
    }
  });

  it('pairs each player with a free village at distance >= 2', () => {
    const map = generateMap(3, 42);
    expect(map.spawns).toHaveLength(3);
    for (const s of map.spawns) {
      expect(hexDistance(s.start, s.free)).toBeGreaterThanOrEqual(2);
    }
  });

  it('never places a settlement on the map center tile', () => {
    const map = generateMap(3, 42);
    const center = map.tiles.find((t) => t.q === 0 && t.r === 0);
    expect(center?.type).not.toBe(TileType.Settlement);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/game/mapGen'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/mapGen.ts`:

```ts
import { allTiles, axialKey, hexDistance, hexNeighbors, hexToPixel } from './hex';
import { TERRAIN_TYPES, TileType, WEIGHTED_TERRAIN } from './tileTypes';
import { SeededRandom } from '../util/random';

export interface MapTile {
  q: number;
  r: number;
  type: TileType;
  owner: number | null;
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
  if (playerCount === 2) return 4;
  if (playerCount === 3) return 5;
  throw new Error(`Unsupported player count: ${playerCount}`);
}

function angleOf(tile: { q: number; r: number }): number {
  const p = hexToPixel(tile, 1);
  return Math.atan2(p.y, p.x);
}

function sectorCenterAngle(sector: number, playerCount: number): number {
  return ((sector + 0.5) / playerCount) * 2 * Math.PI - Math.PI;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 2 * Math.PI - d);
}

function nearestToCenterline(
  candidates: { q: number; r: number }[],
  target: number,
): { q: number; r: number } {
  let best: { q: number; r: number } | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = angleDiff(angleOf(c), target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  if (!best) throw new Error('No candidate tile for settlement');
  return best;
}

export function generateMap(playerCount: number, seed: number): GameMap {
  const radius = mapRadiusFor(playerCount);
  const rng = new SeededRandom(seed);
  const tiles = allTiles(radius);
  const tileMap = new Map<string, MapTile>();
  for (const t of tiles) {
    tileMap.set(axialKey(t), { q: t.q, r: t.r, type: TileType.Land, owner: null });
  }

  const reserved = new Set<string>();
  const spawns: Spawn[] = [];

  for (let p = 0; p < playerCount; p++) {
    const target = sectorCenterAngle(p, playerCount);
    const inSector = tiles.filter(
      (t) => angleDiff(angleOf(t), target) < Math.PI / playerCount && !(t.q === 0 && t.r === 0),
    );
    let candidates = inSector.filter((t) => !reserved.has(axialKey(t)));
    const start = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(start)) reserved.add(axialKey(n));

    candidates = inSector.filter(
      (t) => !reserved.has(axialKey(t)) && hexDistance(t, start) >= 2,
    );
    const free = nearestToCenterline(candidates, target);
    for (const n of hexNeighbors(free)) reserved.add(axialKey(n));

    spawns.push({ start, free });
  }

  for (let p = 0; p < playerCount; p++) {
    const { start, free } = spawns[p];
    tileMap.get(axialKey(start))!.type = TileType.Settlement;
    tileMap.get(axialKey(start))!.owner = p;
    tileMap.get(axialKey(free))!.type = TileType.Settlement;
    tileMap.get(axialKey(free))!.owner = null;
  }

  for (const tile of tileMap.values()) {
    if (tile.type === TileType.Settlement) continue;
    tile.type = reserved.has(axialKey(tile))
      ? rng.pick(TERRAIN_TYPES)
      : rng.pick(WEIGHTED_TERRAIN);
  }

  return { radius, tiles: [...tileMap.values()], spawns };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all 6 mapGen tests plus previous).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts tests/mapGen.test.ts
git commit -m "feat: add hex map generation with settlement placement"
```

---

### Task 6: Texture factory + map renderer (temporary preview)

**Files:**
- Create: `src/render/textureFactory.ts`
- Create: `src/render/mapRenderer.ts`
- Create: `src/main.ts` (temporary preview; rewritten in Task 7)
- Test: manual — run dev server, see a colored hex map.

**Interfaces:**
- Consumes: `hex.ts` (`hexToPixel`), `tileTypes.ts` (`TileType`, `TILE_TYPE_COLORS`), `tribes.ts` (`TRIBE`/`TRIBES`), `mapGen.ts` (`generateMap`), `players.ts` (`buildPlayers`).
- Produces:
  - `interface TextureSet { tileTextures: Record<TileType, Texture>; tribeTextures: Record<Tribe, Texture>; neutralSettlementTexture: Texture }`
  - `createTextures(app: PIXI.Application, hexSize?: number): TextureSet` — generates a colored hexagon texture per tile type, per tribe, plus neutral gray for free settlements
  - `renderMap(app: PIXI.Application, map: GameMap, textures: TextureSet, players: Player[], hexSize?: number): PIXI.Container` — one `Sprite` per tile, centered on screen

- [ ] **Step 1: Write `src/render/textureFactory.ts`**

```ts
import { Application, Graphics, Texture } from 'pixi.js';
import { TileType, TILE_TYPE_COLORS } from '../game/tileTypes';
import { TRIBES, Tribe } from '../game/tribes';

export interface TextureSet {
  tileTextures: Record<TileType, Texture>;
  tribeTextures: Record<Tribe, Texture>;
  neutralSettlementTexture: Texture;
}

function hexagonPoints(size: number): number[] {
  const points: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    points.push(size * Math.cos(angle), size * Math.sin(angle));
  }
  return points;
}

function makeHexTexture(app: Application, fill: number, hexSize: number): Texture {
  const g = new Graphics();
  g.poly(hexagonPoints(hexSize)).fill(fill);
  g.stroke({ width: 2, color: 0x000000 });
  const texture = app.renderer.generateTexture(g);
  g.destroy();
  return texture;
}

export function createTextures(app: Application, hexSize = 40): TextureSet {
  const tileTextures = {} as Record<TileType, Texture>;
  for (const type of Object.keys(TILE_TYPE_COLORS) as unknown as TileType[]) {
    tileTextures[type] = makeHexTexture(app, TILE_TYPE_COLORS[type], hexSize);
  }
  const tribeTextures = {} as Record<Tribe, Texture>;
  for (const tribe of TRIBES) {
    tribeTextures[tribe.id] = makeHexTexture(app, tribe.color, hexSize);
  }
  return {
    tileTextures,
    tribeTextures,
    neutralSettlementTexture: makeHexTexture(app, 0x9a9a9a, hexSize),
  };
}
```

- [ ] **Step 2: Write `src/render/mapRenderer.ts`**

```ts
import { Application, Container, Sprite } from 'pixi.js';
import { hexToPixel } from '../game/hex';
import { GameMap } from '../game/mapGen';
import { Player } from '../game/players';
import { TileType } from '../game/tileTypes';
import { TextureSet } from './textureFactory';

export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  hexSize = 40,
): Container {
  const container = new Container();
  container.position.set(app.screen.width / 2, app.screen.height / 2);

  for (const tile of map.tiles) {
    let texture;
    if (tile.type === TileType.Settlement) {
      texture =
        tile.owner === null
          ? textures.neutralSettlementTexture
          : textures.tribeTextures[players[tile.owner].tribe];
    } else {
      texture = textures.tileTextures[tile.type];
    }
    const sprite = new Sprite(texture);
    const p = hexToPixel(tile, hexSize);
    sprite.anchor.set(0.5);
    sprite.position.set(p.x, p.y);
    container.addChild(sprite);
  }

  return container;
}
```

- [ ] **Step 3: Write temporary `src/main.ts` preview**

This is a temporary entry to visually verify rendering. It is replaced in Task 7.

```ts
import { Application } from 'pixi.js';
import { generateMap } from './game/mapGen';
import { buildPlayers } from './game/players';
import { Tribe } from './game/tribes';
import { renderMap } from './render/mapRenderer';
import { createTextures } from './render/textureFactory';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#1a1a2e', antialias: true });
  document.getElementById('game-root')!.appendChild(app.canvas);
  document.getElementById('screen-game')!.classList.remove('hidden');

  const players = buildPlayers(Tribe.Villagers, 1);
  const map = generateMap(players.length, 42);
  const textures = createTextures(app);
  app.stage.addChild(renderMap(app, map, textures, players));
}

boot();
```

- [ ] **Step 4: Verify rendering manually**

Run: `npm run dev`, open the printed URL in a browser.
Expected: a hex-shaped map fills the window — green land, yellow sand, white snow, darker greens for forests, blue water, gray mountains, a gray settlement hex plus two tribe-colored settlement hexes (brown/orange). Verify by eye.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts src/main.ts
git commit -m "feat: render hex map with pixijs sprites"
```

---

### Task 7: Screens router (start + setup)

**Files:**
- Create: `src/screens/startScreen.ts`
- Create: `src/screens/setupScreen.ts`
- Create: `src/screens/gameScreen.ts` (players list only for now; map added in Task 8)
- Rewrite: `src/main.ts` (replace temporary preview)
- Test: manual — click through start → setup → game.

**Interfaces:**
- Consumes: `tribes.ts` (`TRIBES`), `players.ts` (`buildPlayers`), `index.html` element ids.
- Produces:
  - `initStartScreen(onStart: () => void): void` — binds `#start-btn` click
  - `initSetupScreen(onStart: (tribe: Tribe, enemyCount: number) => void): void` — builds tribe/enemy buttons from `TRIBES`, binds `#setup-start-btn`
  - `initGameScreen(app: PIXI.Application, players: Player[]): void` — appends canvas to `#game-root`, fills `#players-list` (map rendering added in Task 8)

- [ ] **Step 1: Write `src/screens/startScreen.ts`**

```ts
export function initStartScreen(onStart: () => void): void {
  document.getElementById('start-btn')!.addEventListener('click', onStart);
}
```

- [ ] **Step 2: Write `src/screens/setupScreen.ts`**

```ts
import { TRIBES, Tribe } from '../game/tribes';

export function initSetupScreen(onStart: (tribe: Tribe, enemyCount: number) => void): void {
  const tribeContainer = document.getElementById('tribe-select')!;
  const enemyContainer = document.getElementById('enemy-select')!;

  let selectedTribe: Tribe = TRIBES[0].id;
  let selectedEnemies = 1;

  const colorCss = (color: number): string =>
    `#${color.toString(16).padStart(6, '0')}`;

  for (const tribe of TRIBES) {
    const btn = document.createElement('button');
    btn.textContent = tribe.name;
    btn.style.background = colorCss(tribe.color);
    btn.addEventListener('click', () => {
      selectedTribe = tribe.id;
      for (const b of tribeContainer.querySelectorAll('button')) b.classList.remove('selected');
      btn.classList.add('selected');
    });
    tribeContainer.appendChild(btn);
  }

  for (const count of [1, 2]) {
    const btn = document.createElement('button');
    btn.textContent = `${count}`;
    btn.addEventListener('click', () => {
      selectedEnemies = count;
      for (const b of enemyContainer.querySelectorAll('button')) b.classList.remove('selected');
      btn.classList.add('selected');
    });
    enemyContainer.appendChild(btn);
  }

  document.getElementById('setup-start-btn')!.addEventListener('click', () => {
    onStart(selectedTribe, selectedEnemies);
  });
}
```

- [ ] **Step 3: Write `src/screens/gameScreen.ts`**

```ts
import { Application } from 'pixi.js';
import { Player } from '../game/players';
import { TRIBES } from '../game/tribes';

export function initGameScreen(app: Application, players: Player[]): void {
  document.getElementById('game-root')!.appendChild(app.canvas);

  const list = document.getElementById('players-list')!;
  list.innerHTML = players
    .map((p) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const color = `#${tribe.color.toString(16).padStart(6, '0')}`;
      const role = p.isHuman ? ' (you)' : ' (AI)';
      return `<div style="color:${color}">${tribe.name}${role}</div>`;
    })
    .join('');
}
```

- [ ] **Step 4: Rewrite `src/main.ts` (replace the preview)**

```ts
import { Application } from 'pixi.js';
import { buildPlayers } from './game/players';
import { Tribe } from './game/tribes';
import { initGameScreen } from './screens/gameScreen';
import { initSetupScreen } from './screens/setupScreen';
import { initStartScreen } from './screens/startScreen';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#1a1a2e', antialias: true });

  const show = (id: string): void => {
    for (const el of document.querySelectorAll('.screen')) el.classList.add('hidden');
    document.getElementById(id)!.classList.remove('hidden');
  };

  initStartScreen(() => show('screen-setup'));

  initSetupScreen((tribe: Tribe, enemyCount: number) => {
    const players = buildPlayers(tribe, enemyCount);
    initGameScreen(app, players);
    show('screen-game');
  });

  show('screen-start');
}

boot();
```

- [ ] **Step 5: Verify flow manually**

Run: `npm run dev`, open the URL.
Expected:
1. Start screen with title and Start button (default).
2. Click Start → setup screen: three tribe buttons (brown/orange/red), enemy count buttons 1 and 2, Start button.
3. Select a tribe and enemy count, click Start → game screen: blank canvas area + players list overlay in the top-left with each player's tribe name colored and `(you)`/`(AI)` markers.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens src/main.ts
git commit -m "feat: add start and setup screens with router"
```

---

### Task 8: Render the map on the game screen

**Files:**
- Modify: `src/screens/gameScreen.ts`
- Test: manual — full flow shows the generated map.

**Interfaces:**
- Consumes: `gameScreen.ts` (existing), `mapGen.ts` (`generateMap`), `textureFactory.ts` (`createTextures`), `mapRenderer.ts` (`renderMap`), `players.ts` (`Player`).
- Produces: game screen renders a generated hex map (seeded from current time), colored per tile type, settlements in tribe colors / neutral gray.

- [ ] **Step 1: Modify `src/screens/gameScreen.ts`**

Replace the entire file contents with:

```ts
import { Application } from 'pixi.js';
import { generateMap } from '../game/mapGen';
import { Player } from '../game/players';
import { TRIBES } from '../game/tribes';
import { renderMap } from '../render/mapRenderer';
import { createTextures } from '../render/textureFactory';

export function initGameScreen(app: Application, players: Player[]): void {
  document.getElementById('game-root')!.appendChild(app.canvas);

  const list = document.getElementById('players-list')!;
  list.innerHTML = players
    .map((p) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const color = `#${tribe.color.toString(16).padStart(6, '0')}`;
      const role = p.isHuman ? ' (you)' : ' (AI)';
      return `<div style="color:${color}">${tribe.name}${role}</div>`;
    })
    .join('');

  const map = generateMap(players.length, Math.floor(Math.random() * 100000));
  const textures = createTextures(app);
  app.stage.addChild(renderMap(app, map, textures, players));
}
```

- [ ] **Step 2: Verify full flow manually**

Run: `npm run dev`, open the URL.
Expected: Start → setup (pick tribe + enemies) → game screen shows the generated hex map (colored hexes, tribe-colored settlements, gray free settlements) plus the players list. Repeat with 1 and 2 enemies — map size changes (smaller for 2 players, larger for 3).

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all unit tests still PASS.

- [ ] **Step 3: Commit**

```bash
git add src/screens/gameScreen.ts
git commit -m "feat: render generated map on game screen"
```

---

## Self-Review Notes

- **Spec coverage:** Start screen (Task 7), setup screen with tribe + enemy count (Task 7), game screen with map + players list (Tasks 6–8), hex map shape/radius (Task 3, 5), wedge-sector settlement placement + free villages + empty rings (Task 5), terrain fill with all 8 types + weighting (Task 4, 5), sprite rendering from generated textures (Task 6), seeded RNG determinism (Task 2, 5). All spec sections mapped.
- **Placeholder scan:** No TBD/TODO. Every code step contains full source.
- **Type consistency:** `Axial`/`axialKey`/`hexToPixel` used identically across Tasks 3–8. `MapTile.owner: number | null` matches `players[tile.owner].tribe` indexing in renderers. `generateMap(playerCount, seed)` signature stable. `Player.index` equals the owner index used in `mapGen`.
