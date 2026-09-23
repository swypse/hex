# Villagers Composite Village Textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Villagers-owned villages as a composite of stacked 70×52 block tiles from `village-villagers-atlas.png` — 3 left + 4 right columns, `level` blocks per column, one new block per column chosen `m1`/`m2` at each upgrade — while every other tribe keeps its existing village texture.

**Architecture:** `Settlement` gains a serialized `build?: SettlementBuild` record whose per-column variant arrays are extended at upgrade time. On the render side a cache — `VillageBuildTextureService` — lazily bakes one composite texture per `level|variants` and the existing single `villageSprite` swaps it in for Villagers settlements. A pure `villageBuildFrames()` function owns the geometry and is unit-tested; the Pixi baking is a thin layer.

**Tech Stack:** TypeScript, PixiJS 8, Vitest (`npm test`), `npm run typecheck`. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-19-village-build-textures-design.md`.
- Block art 70×52; upper block overlaps the block below it by 25px → vertical step 27.
- Main columns: left l1, l2, l3 at `(0,0)`, `(25,10)`, `(50,20)`; right r4→r1 at `(170,0)`, `(145,10)`, `(120,20)`, `(95,30)`.
- Back columns (drawn first, always `villagers-r-*` frames): left-back 3→1 at `(95,-30)`, `(70,-20)`, `(45,-10)`; right-back 1→2 at `(120,-20)`, `(145,-10)`.
- Column block counts (`src/game/village-build.ts`, shared by game + render): short columns (`l1`, `r4`, all 5 back columns) have `ceil(level/2)` blocks; tall columns (`l2`, `l3`, `r1`, `r2`, `r3`) have that plus one on even levels. Level 1 → all 1 block, level 2 → tall only 2, level 3 → all 2, level 4 → tall only 3, and so on.
- Columns are ground-anchored: block `i` (0 = top) of a column sits at `y = colY + (i − (blocks−1))·27`, so the bottom block's top is always at `colY` and extra blocks rise upward.
- Composite width 240; height `max(colY)+52 − min(colY − (blocks−1)·27)` (levels 1–6 → 112/112/139/139/166/166); baked at `scale = √3·hexSize/240`; `anchorY = 1 − 56/height` pins the composite bottom at a fixed 56px below the hex center (level-1 centered look), so the village bottom never moves as it levels up.
- Top block of every column is `villagers-l-t1` / `villagers-r-t1`; the blocks below it are `villagers-l-m1…m4` (left columns only) and `villagers-r-m1…m4` (everywhere else), chosen `['m1','m2','m3','m4'][floor(roll()·4)]`.
- Only Villagers use the composite; free villages and all other tribes render exactly as today.
- Missing/partial `build` falls back to `'m1'`; records created before back columns existed top up their back arrays on the next upgrade; a failed atlas load degrades to the existing per-tribe texture.
- File names are kebab-case (repository rule).
- No changes to `GAME.md` (visual art, not a rule change).

---

## File Structure

- `src/game/map-gen.ts` — **modify**. New `VillageBlockVariant`/`SettlementBuild` types; `Settlement.build?: SettlementBuild`.
- `src/game/village.ts` — **modify**. `upgradeVillage(map, tile, roll)` records per-column m1/m2 choices.
- `src/game/simulator.ts` — **modify**. Both `upgradeVillage` call sites (doUpgradeVillage, free-upgrade bonus) pass `this.rng`.
- `src/render/village-build-atlas.ts` — **create**. Loads `village-villagers-atlas.png` once, slices the 6 frames (mirror `buildings-atlas.ts`).
- `src/render/village-build-texture.ts` — **create**. Pure geometry (`villageBuildFrames`, `villageBuildSignature`, constants) + `VillageBuildTextureService`.
- `src/render/texture-factory.ts` — **modify**. `TextureSet.villageBuild?`; construct + `ensureLoaded()` the service in `createTextures`.
- `src/render/village-texture.ts` — **modify**. Optional 4th `villageBuild` param; Villagers branch returns the composite.
- `src/render/map-renderer.ts` — **modify**. Pass `this.textures.villageBuild` at the `villageTextureFor` call site.
- Tests: `tests/village.test.ts` (rolling), `tests/village-build-atlas.test.ts` (new), `tests/village-build-texture.test.ts` (new).
- Plan: `docs/superpowers/plans/2026-09-19-village-build-textures.md` (this file).

---

### Task 1: Settlement build state + upgrade-time rolling

**Files:**
- Modify: `src/game/map-gen.ts` (Settlement + new types)
- Modify: `src/game/village.ts` (`upgradeVillage`)
- Modify: `src/game/simulator.ts:495`, `src/game/simulator.ts:651`
- Test: `tests/village.test.ts`

**Interfaces:**
- Produces:
  - `export type VillageBlockVariant = 'm1' | 'm2'` (map-gen.ts)
  - `export interface SettlementBuild { l: VillageBlockVariant[][]; r: VillageBlockVariant[][]; }` (map-gen.ts)
  - `Settlement.build?: SettlementBuild` (map-gen.ts)
  - `export function upgradeVillage(map: GameMap, tile: MapTile, roll?: () => number): void` (village.ts)

- [ ] **Step 1: Write the failing tests**

Append to `tests/village.test.ts` after the existing `upgradeVillage` describe:

```ts
describe('upgradeVillage build rolling', () => {
  const alwaysM1 = () => 0.49;
  const alwaysM2 = () => 0.5;

  it('records level-1 middle blocks per column, all m1 when roll < 0.5', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    upgradeVillage(map, a, alwaysM1);
    const build = a.settlement!.build!;
    expect(build.l).toHaveLength(3);
    expect(build.r).toHaveLength(4);
    for (const col of [...build.l, ...build.r]) {
      expect(col).toEqual(['m1']);
    }
  });

  it('uses m2 when roll >= 0.5', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    upgradeVillage(map, a, alwaysM2);
    for (const col of [...a.settlement!.build!.l, ...a.settlement!.build!.r]) {
      expect(col).toEqual(['m2']);
    }
  });

  it('appends one block per column at every further upgrade', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    upgradeVillage(map, a, alwaysM1);
    upgradeVillage(map, a, alwaysM2);
    const build = a.settlement!.build!;
    expect(a.settlement!.level).toBe(3);
    for (const col of [...build.l, ...build.r]) {
      expect(col).toEqual(['m1', 'm2']);
    }
  });

  it('top-ups a legacy settlement that already has a level but no build', () => {
    const map = makeMap();
    const a = map.tiles[0]!;
    a.settlement!.level = 3;
    upgradeVillage(map, a, alwaysM1);
    expect(a.settlement!.level).toBe(4);
    for (const col of [...a.settlement!.build!.l, ...a.settlement!.build!.r]) {
      expect(col).toHaveLength(3);
      expect(col.every((v) => v === 'm1')).toBe(true);
    }
  });

  it('does not record build choices for neutral villages', () => {
    const map = makeMap();
    const free = map.tiles[2]!;
    upgradeVillage(map, free, alwaysM1);
    expect(free.settlement!.level).toBe(1);
    expect(free.settlement!.build).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/village.test.ts`
Expected: FAIL — `build`/SettlementBuild undefined (type + runtime errors).

- [ ] **Step 3: Add the types to map-gen.ts**

In `src/game/map-gen.ts`, directly above the `Settlement` interface:

```ts
export type VillageBlockVariant = 'm1' | 'm2';

/** Below-top block variants per column, top-down, chosen when a village
 *  levels up. `l[0..2]` are left columns 1–3, `r[0..3]` right columns 1–4;
 *  each inner array has length `level - 1`. Absent for level-1 villages and
 *  older saves. */
export interface SettlementBuild {
  l: VillageBlockVariant[][];
  r: VillageBlockVariant[][];
}
```

Add `build?: SettlementBuild;` to the `Settlement` interface, after `wall?: boolean;`.

- [ ] **Step 4: Record choices in upgradeVillage**

In `src/game/village.ts`:

- Extend the existing `import { GameMap, MapTile } from './map-gen';` line to also import the new types:

```ts
import { GameMap, MapTile, SettlementBuild, VillageBlockVariant } from './map-gen';
```

Change `export function upgradeVillage(map: GameMap, tile: MapTile): void` to:

```ts
export function upgradeVillage(map: GameMap, tile: MapTile, roll: () => number = Math.random): void {
  const settlement = tile.settlement;
  if (!settlement || settlement.owner === null) return;
  settlement.level++;
  const middleCount = settlement.level - 1;
  const build: SettlementBuild = settlement.build ??= { l: [[], [], []], r: [[], [], [], []] };
  const pick = (): VillageBlockVariant => (roll() < 0.5 ? 'm1' : 'm2');
  for (const columns of [build.l, build.r]) {
    for (const column of columns) {
      while (column.length < middleCount) column.push(pick());
    }
  }
  const radius = claimRadius(settlement.level);
  for (const t of map.tiles) {
    if (hexDistance(t, tile) > radius) continue;
    claimTileForVillage(t, tile);
  }
  exploreVillageSight(map, tile, settlement.owner);
}
```

(Keep the existing claim/explore body below the new rolling block — nothing else in the function changes.)

- [ ] **Step 5: Pass the sim rng at both call sites**

`src/game/simulator.ts`, in `doUpgradeVillage`:

```ts
    upgradeVillage(this.map, tile, this.rng);
```

`src/game/simulator.ts`, in the `villageUpgrade` bonus case (the `if (village) {` block):

```ts
          upgradeVillage(this.map, village, this.rng);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/village.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/game/map-gen.ts src/game/village.ts src/game/simulator.ts tests/village.test.ts
git commit -m "feat: record village build block choices on upgrade (villagers)"
```

---

### Task 2: Village-villagers atlas loader

**Files:**
- Create: `src/render/village-build-atlas.ts`
- Test: `tests/village-build-atlas.test.ts`

**Interfaces:**
- Consumes: `VILLAGE_VILLAGERS_ATLAS_FILE`, `VILLAGE_VILLAGERS_ATLAS_FRAMES` from `../game/village-villagers-atlas-data.gen`
- Produces:
  - `export function ensureVillageVillagersAtlas(): Promise<void>`
  - `export function villageVillagerFrameTexture(frameKey: string): Texture | null`

- [ ] **Step 1: Write the failing test**

`tests/village-build-atlas.test.ts` (mirror `tests/buildings-atlas.test.ts`):

```ts
import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { VILLAGE_VILLAGERS_ATLAS_FRAMES, VILLAGE_VILLAGERS_ATLAS_CELL_W, VILLAGE_VILLAGERS_ATLAS_CELL_H } from '../src/game/village-villagers-atlas-data.gen';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface VillageVillagersAtlasModule {
  ensureVillageVillagersAtlas: () => Promise<void>;
  villageVillagerFrameTexture: (key: string) => Texture | null;
}

describe('village-villagers atlas loader', () => {
  let atlas: VillageVillagersAtlasModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    atlas = await import('../src/render/village-build-atlas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the single packed village-villagers atlas image', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/village-villagers-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices a frame out of the atlas with the correct bounds', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = VILLAGE_VILLAGERS_ATLAS_FRAMES['villagers-l-t1']!;
    const tex = atlas.villageVillagerFrameTexture('villagers-l-t1');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(VILLAGE_VILLAGERS_ATLAS_CELL_W);
    expect(tex!.height).toBe(VILLAGE_VILLAGERS_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('returns null for an unknown frame key', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(atlas.villageVillagerFrameTexture('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/village-build-atlas.test.ts`
Expected: FAIL — cannot find module `../src/render/village-build-atlas`.

- [ ] **Step 3: Create the loader**

`src/render/village-build-atlas.ts`:

```ts
import { Rectangle, Texture } from 'pixi.js';
import { VILLAGE_VILLAGERS_ATLAS_FILE, VILLAGE_VILLAGERS_ATLAS_FRAMES } from '../game/village-villagers-atlas-data.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

let atlasTexture: Texture | null = null;
let atlasPromise: Promise<void> | null = null;
const frameCache = new Map<string, Texture>();

/** Loads the single packed village-villagers atlas image once and shares the
 *  same load promise with every caller. A failed load resolves without a
 *  texture, so callers degrade to their non-composite fallback. */
export function ensureVillageVillagersAtlas(): Promise<void> {
  if (atlasPromise) return atlasPromise;
  atlasPromise = new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        atlasTexture = Texture.from(img);
      } catch {
        console.error('[villageBuildAtlas] Texture.from failed for', TEXTURE_BASE + VILLAGE_VILLAGERS_ATLAS_FILE);
      }
      resolve();
    };
    img.onerror = () => {
      console.error('[villageBuildAtlas] onerror for', TEXTURE_BASE + VILLAGE_VILLAGERS_ATLAS_FILE);
      resolve();
    };
    img.src = TEXTURE_BASE + VILLAGE_VILLAGERS_ATLAS_FILE;
  });
  return atlasPromise;
}

/** Returns the village-villager PNG texture for an atlas frame key, sliced
 *  out of the packed atlas (one HTTP image total). Null when the atlas is
 *  unavailable or the frame is missing. */
export function villageVillagerFrameTexture(frameKey: string): Texture | null {
  const frame = VILLAGE_VILLAGERS_ATLAS_FRAMES[frameKey];
  if (!frame || !atlasTexture) return null;
  const cached = frameCache.get(frameKey);
  if (cached) return cached;
  const tex = new Texture({
    source: atlasTexture.source,
    frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
    label: `village-villagers/${frameKey}`,
  });
  frameCache.set(frameKey, tex);
  return tex;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/village-build-atlas.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/render/village-build-atlas.ts tests/village-build-atlas.test.ts
git commit -m "feat: village-villagers atlas loader"
```

---

### Task 3: Composite geometry (pure) + signature

**Files:**
- Create: `src/render/village-build-texture.ts`
- Test: `tests/village-build-texture.test.ts`

**Interfaces:**
- Consumes: `SettlementBuild`, `VillageBlockVariant` (`../game/map-gen`) — from Task 1
- Produces:
  - `export const VILLAGE_BUILD_BLOCK_W = 70`
  - `export const VILLAGE_BUILD_BLOCK_H = 52`
  - `export const VILLAGE_BUILD_BLOCK_STEP = 27`
  - `export const VILLAGE_BUILD_WIDTH = 240`
  - `export interface VillageBuildFrame { x: number; y: number; frameKey: string }`
  - `export function villageBuildHeight(level: number): number`
  - `export function villageBuildFrames(level: number, build?: SettlementBuild): { frames: VillageBuildFrame[]; width: number; height: number }`
  - `export function villageBuildSignature(level: number, build?: SettlementBuild): string`

- [ ] **Step 1: Write the failing test**

`tests/village-build-texture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  VILLAGE_BUILD_BLOCK_H,
  VILLAGE_BUILD_BLOCK_STEP,
  VILLAGE_BUILD_WIDTH,
  villageBuildFrames,
  villageBuildHeight,
  villageBuildSignature,
} from '../src/render/village-build-texture';
import type { SettlementBuild } from '../src/game/map-gen';

describe('villageBuildFrames', () => {
  it('level 1: exactly seven top blocks in draw order at column origins', () => {
    const { frames, width, height } = villageBuildFrames(1);
    expect(width).toBe(VILLAGE_BUILD_WIDTH);
    expect(height).toBe(VILLAGE_BUILD_BLOCK_H);
    expect(frames).toEqual([
      { x: 0, y: 0, frameKey: 'villagers-l-t1' },
      { x: 150, y: 0, frameKey: 'villagers-r-t1' },
      { x: 25, y: 10, frameKey: 'villagers-l-t1' },
      { x: 125, y: 10, frameKey: 'villagers-r-t1' },
      { x: 50, y: 20, frameKey: 'villagers-l-t1' },
      { x: 100, y: 20, frameKey: 'villagers-r-t1' },
      { x: 75, y: 30, frameKey: 'villagers-r-t1' },
    ]);
  });

  it('level 2 stacks one middle block under each top with a 27px step', () => {
    const build: SettlementBuild = {
      l: [['m1'], ['m1'], ['m1']],
      r: [['m1'], ['m1'], ['m1'], ['m1']],
    };
    const { frames, height } = villageBuildFrames(2, build);
    expect(height).toBe(VILLAGE_BUILD_BLOCK_H + VILLAGE_BUILD_BLOCK_STEP);
    expect(frames).toHaveLength(14);
    expect(frames[0]!).toEqual({ x: 0, y: 0, frameKey: 'villagers-l-t1' });
    expect(frames[1]!).toEqual({ x: 0, y: VILLAGE_BUILD_BLOCK_STEP, frameKey: 'villagers-l-m1' });
    expect(frames[7]!).toEqual({ x: 145, y: 10 + VILLAGE_BUILD_BLOCK_STEP, frameKey: 'villagers-r-m1' });
    expect(frames[13]!).toEqual({ x: 95, y: 30 + VILLAGE_BUILD_BLOCK_STEP, frameKey: 'villagers-r-m1' });
  });

  it('uses the recorded m2 variant per block', () => {
    const build: SettlementBuild = {
      l: [['m2'], ['m2'], ['m2']],
      r: [['m1'], ['m1'], ['m1'], ['m1']],
    };
    const { frames } = villageBuildFrames(2, build);
    expect(frames[1]!.frameKey).toBe('villagers-l-m2');
    expect(frames[5]!.frameKey).toBe('villagers-l-m2');
  });

  it('falls back to m1 for a missing build (older saves)', () => {
    const { frames } = villageBuildFrames(2);
    expect(frames[1]!.frameKey).toBe('villagers-l-m1');
    expect(frames[7]!.frameKey).toBe('villagers-r-m1');
  });

  it('level 3 has 21 blocks and grows only taller', () => {
    const { frames, width, height } = villageBuildFrames(3);
    expect(frames).toHaveLength(21);
    expect(width).toBe(VILLAGE_BUILD_WIDTH);
    expect(height).toBe(52 + 2 * VILLAGE_BUILD_BLOCK_STEP);
  });

  it('height grows with level', () => {
    expect(villageBuildHeight(1)).toBe(52);
    expect(villageBuildHeight(2)).toBe(52 + VILLAGE_BUILD_BLOCK_STEP);
    expect(villageBuildHeight(4)).toBe(52 + 3 * VILLAGE_BUILD_BLOCK_STEP);
  });
});

describe('villageBuildSignature', () => {
  it('distinguishes level and every column variant', () => {
    const a: SettlementBuild = { l: [['m1'], [], []], r: [[], [], [], []] };
    const b: SettlementBuild = { l: [['m2'], [], []], r: [[], [], [], []] };
    expect(villageBuildSignature(2, a)).toBe('2|m1;;|;;;');
    expect(villageBuildSignature(2, a)).not.toBe(villageBuildSignature(2, b));
    expect(villageBuildSignature(2, a)).not.toBe(villageBuildSignature(3, a));
    expect(villageBuildSignature(2, undefined)).toBe('2|-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/village-build-texture.test.ts`
Expected: FAIL — cannot find module `../src/render/village-build-texture`.

- [ ] **Step 3: Create the geometry module**

`src/render/village-build-texture.ts`:

```ts
import type { SettlementBuild, VillageBlockVariant } from '../game/map-gen';

export const VILLAGE_BUILD_BLOCK_W = 70;
export const VILLAGE_BUILD_BLOCK_H = 52;
/** Vertical step between stacked blocks: an upper block overlaps the block
 *  below it by 25px (52 - 25). */
export const VILLAGE_BUILD_BLOCK_STEP = 27;
/** Composite width: left columns at x 0/25/50, right columns at 95/120/
 *  145/170; the last block (x=170) is 70 wide → 240. */
export const VILLAGE_BUILD_WIDTH = 240;

export interface VillageBuildFrame {
  x: number;
  y: number;
  frameKey: string;
}

/** Column anchors (top-block origin) in draw order, back → front: left
 *  1 under 2 under 3, right 4 under 3 under 2 under 1, right in front of
 *  left on the y=20 tie (left col 3 vs right col 2). */
const COLUMN_LAYOUT: { side: 'l' | 'r'; column: number; x: number; y: number }[] = [
  { side: 'l', column: 0, x: 0, y: 0 },
  { side: 'r', column: 3, x: 150, y: 0 },
  { side: 'l', column: 1, x: 25, y: 10 },
  { side: 'r', column: 2, x: 125, y: 10 },
  { side: 'l', column: 2, x: 50, y: 20 },
  { side: 'r', column: 1, x: 100, y: 20 },
  { side: 'r', column: 0, x: 75, y: 30 },
];

export function villageBuildHeight(level: number): number {
  return VILLAGE_BUILD_BLOCK_H + (level - 1) * VILLAGE_BUILD_BLOCK_STEP;
}

/** Resolves the below-top variant for a column block (j = 0 is the block
 *  directly under the top), falling back to 'm1' for missing data. */
function variantAt(build: SettlementBuild | undefined, side: 'l' | 'r', column: number, j: number): VillageBlockVariant {
  return build?.[side][column]?.[j] ?? 'm1';
}

/** Ordered list of every block texture in draw order plus the composite size.
 *  Pure: no Pixi, no side effects — fully unit-testable. */
export function villageBuildFrames(
  level: number,
  build?: SettlementBuild,
): { frames: VillageBuildFrame[]; width: number; height: number } {
  const frames: VillageBuildFrame[] = [];
  for (const col of COLUMN_LAYOUT) {
    for (let i = 0; i < level; i++) {
      const isTop = i === 0;
      const frameKey = `villagers-${col.side}-${isTop ? 't1' : variantAt(build, col.side, col.column, i - 1)}`;
      frames.push({ x: col.x, y: col.y + VILLAGE_BUILD_BLOCK_STEP * i, frameKey });
    }
  }
  return { frames, width: VILLAGE_BUILD_WIDTH, height: villageBuildHeight(level) };
}

/** Cache key for a composite look: level + every column's variants. */
export function villageBuildSignature(level: number, build?: SettlementBuild): string {
  if (!build) return `${level}|-`;
  const colSig = (cols: VillageBlockVariant[][]): string => cols.map((c) => c.join('')).join(';');
  return `${level}|${colSig(build.l)}|${colSig(build.r)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/village-build-texture.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/render/village-build-texture.ts tests/village-build-texture.test.ts
git commit -m "feat: village build composite geometry (pure)"
```

---

### Task 4: Composite baking service

**Files:**
- Modify: `src/render/village-build-texture.ts`

**Interfaces:**
- Consumes: `villageBuildFrames`, `villageBuildSignature` (Task 3); `ensureVillageVillagersAtlas`, `villageVillagerFrameTexture` (Task 2); `TileTexture` (`./texture-factory`)
- Produces:
  - `export class VillageBuildTextureService { constructor(app: Application, hexSize: number); ensureLoaded(): Promise<void>; tileTexture(settlement: Settlement): TileTexture | null }`

- [ ] **Step 1: Add the service**

Append to `src/render/village-build-texture.ts` (add `import { Application, Container, Sprite } from 'pixi.js';`, `import type { Settlement } from '../game/map-gen';`, `import { ensureVillageVillagersAtlas, villageVillagerFrameTexture } from './village-build-atlas';`, and `import type { TileTexture } from './texture-factory';`):

```ts
/** Bakes and caches one composite village texture per distinct look. The map
 *  renderer keeps its single `villageSprite`; this only supplies the texture.
 *  Cached by `villageBuildSignature`, so a village re-bakes only when its
 *  level or recorded variants change. */
export class VillageBuildTextureService {
  private readonly cache = new Map<string, TileTexture>();

  constructor(
    private readonly app: Application,
    private readonly hexSize: number,
  ) {}

  ensureLoaded(): Promise<void> {
    return ensureVillageVillagersAtlas();
  }

  tileTexture(settlement: Settlement): TileTexture | null {
    const level = settlement.level;
    const signature = villageBuildSignature(level, settlement.build);
    const cached = this.cache.get(signature);
    if (cached) return cached;
    const { frames, width } = villageBuildFrames(level, settlement.build);
    if (frames.length === 0) return null;
    const blockTextures = frames.map((f) => villageVillagerFrameTexture(f.frameKey));
    if (blockTextures.some((t) => t === null)) return null;
    // The composite is scaled so its 220px width equals the hex width; the
    // texture is anchored (0.5, 0.5), so its center sits at the hex center.
    const scale = (Math.sqrt(3) * this.hexSize) / width;
    const container = new Container();
    container.sortableChildren = true;
    frames.forEach((frame, i) => {
      const sprite = new Sprite(blockTextures[i]!);
      sprite.anchor.set(0, 0);
      sprite.scale.set(scale);
      sprite.position.set(frame.x * scale, frame.y * scale);
      sprite.zIndex = i;
      container.addChild(sprite);
    });
    const texture = this.app.renderer.generateTexture({ target: container, resolution: 1 });
    container.destroy({ children: true });
    const tile: TileTexture = { texture, anchorY: 0.5 };
    this.cache.set(signature, tile);
    return tile;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Verify existing suites still pass**

Run: `npx vitest run tests/village-build-texture.test.ts tests/village-build-atlas.test.ts tests/village.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/render/village-build-texture.ts
git commit -m "feat: village build composite baking service"
```

---

### Task 5: Wire into texture creation + village resolution + renderer

**Files:**
- Modify: `src/render/texture-factory.ts` (TextureSet + createTextures)
- Modify: `src/render/village-texture.ts` (`villageTextureFor`)
- Modify: `src/render/map-renderer.ts:530`

**Interfaces:**
- Consumes: `VillageBuildTextureService` (Task 4)
- Produces: `TextureSet.villageBuild?: VillageBuildTextureService`; `villageTextureFor(settlement, textures, tribe, villageBuild?)` — 4th param optional so existing tests and free/non-Villagers paths are untouched.

- [ ] **Step 1: Add the service to TextureSet and createTextures**

In `src/render/texture-factory.ts`:

- Add import: `import { VillageBuildTextureService } from './village-build-texture';`
- In the `TextureSet` interface, after `freeVillageTexture: TileTexture;`, add:

```ts
  /** Lazily baked composite village textures for the Villagers tribe. */
  villageBuild?: VillageBuildTextureService;
```

- In `createTextures`, before the `return {` statement, add:

```ts
  const villageBuild = new VillageBuildTextureService(app, hexSize);
  await villageBuild.ensureLoaded();
```

- In the returned object, next to `villageTextures,`, add:

```ts
    villageBuild,
```

- [ ] **Step 2: Route Villagers through the composite**

In `src/render/village-texture.ts`:

- Add import: `import type { VillageBuildTextureService } from './village-build-texture';`
- Change `villageTextureFor` to:

```ts
export function villageTextureFor(
  settlement: Settlement | null,
  textures: VillageTextureSet,
  tribe: Tribe | null,
  villageBuild?: VillageBuildTextureService | null,
): { texture: Texture | null; anchorY: number } {
  if (!settlement) return { texture: null, anchorY: 0.5 };
  if (settlement.owner === null) {
    return { texture: textures.freeVillageTexture.texture, anchorY: textures.freeVillageTexture.anchorY };
  }
  const ownerTribe = tribe ?? Tribe.Villagers;
  if (ownerTribe === Tribe.Villagers && villageBuild) {
    const composite = villageBuild.tileTexture(settlement);
    if (composite) return composite;
  }
  const v = settlement.level >= 2
    ? textures.villageTextures[ownerTribe].level2
    : textures.villageTextures[ownerTribe].level1;
  return { texture: v.texture, anchorY: v.anchorY };
}
```

- [ ] **Step 3: Pass the service from the renderer**

In `src/render/map-renderer.ts`, change the `applyTile` village line (currently `const village = villageTextureFor(tile.settlement, this.textures, villageOwnerTribe(tile.settlement, players));`) to:

```ts
    const village = villageTextureFor(
      tile.settlement,
      this.textures,
      villageOwnerTribe(tile.settlement, players),
      this.textures.villageBuild,
    );
```

- [ ] **Step 4: Run the affected suites**

Run: `npx vitest run tests/village-texture.test.ts tests/village-anchor-lifecycle.test.ts tests/map-renderer.test.ts tests/client-render.test.ts tests/missing-unit-texture.test.ts`
Expected: PASS (no test changes needed — the new field and 4th param are both optional)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/render/texture-factory.ts src/render/village-texture.ts src/render/map-renderer.ts
git commit -m "feat: render villagers villages as composite block build"
```

---

### Task 6: Full verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all tests PASS, including `village-build-texture`, `village-build-atlas`, `village`, `village-texture`, `village-anchor-lifecycle`, `map-renderer`, `tile-signature`.

- [ ] **Step 2: Typecheck everything**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Sanity-check the packer manifest matches a full production run**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit any stragglers (e.g. regenerated atlas data, docs)**

```bash
git status
git add -A
git commit -m "chore: finalize village build textures"
```

(If `git status` is clean, skip the commit.)