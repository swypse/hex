# Quantized Tile Elevation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quantize `tileElevation` to 8px steps so tiles sharing a height bucket reuse one texture.

**Architecture:** A one-line rounding change in `src/render/elevation.ts` propagates to every consumer automatically (texture cache key, walls, sprite/unit/highlight positioning, hit-testing, animations), reducing unique textures from ~170 to ~20-40.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Water stays at elevation 0.
- All consumers must remain consistent (they all read `tileElevation`, so the single change keeps them aligned).
- Existing 290 tests pass (two assertions in `tests/textureFactory.test.ts` updated).

---

### Task 1: Quantize tile elevation

**Files:**
- Modify: `src/render/elevation.ts`
- Test: `tests/textureFactory.test.ts`

**Interfaces:**
- Consumes: `MapTile`, `isWaterType`, `HEIGHT_SCALE`.
- Produces: `tileElevation(tile, hexSize)` returns multiples of `ELEVATION_STEP` for land, 0 for water.

- [ ] **Step 1: Write the failing tests (TDD)**

Update the two land assertions in `tests/textureFactory.test.ts`:

```ts
  it('raises land and mountain tiles by their height in 8px steps', () => {
    expect(tileElevation(tile(TileType.GrasslandLand, 0.5), 40)).toBe(24);
    expect(tileElevation(tile(TileType.GrasslandMountain, 0.25), 40)).toBe(8);
  });
```

Note: `0.5 * 40 = 20` → `Math.round(20/8)*8 = 24`; `0.25 * 40 = 10` → `Math.round(10/8)*8 = 8`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/textureFactory.test.ts`
Expected: FAIL — the two land assertions expect `20` and `10`.

- [ ] **Step 3: Implement the quantization**

In `src/render/elevation.ts`:

```ts
import { MapTile } from '../game/mapGen';
import { isWaterType } from '../game/tileTypes';

export const HEIGHT_SCALE = 1;
export const ELEVATION_STEP = 8;

export function tileElevation(tile: MapTile, hexSize: number): number {
  if (isWaterType(tile.terrain)) return 0;
  const px = (tile.height ?? 0) * hexSize * HEIGHT_SCALE;
  return Math.round(px / ELEVATION_STEP) * ELEVATION_STEP;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/textureFactory.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/elevation.ts tests/textureFactory.test.ts
git commit -m "perf: quantize tile elevation to 8px steps to dedupe textures"
```

---

### Task 2: Verify deduplication benefit

**Files:**
- Test: temporary check (removed after)

- [ ] **Step 1: Measure unique textures before/after**

Run a temporary vitest file that counts unique `terrain|heightPx|anchor` combinations
across 3 maps (players 2/3/4, seed 42):

```ts
import { describe, it } from 'vitest';
import { generateMap } from '../src/game/mapGen';
import { axialKey } from '../src/game/hex';
import { tileElevation } from '../src/render/elevation';

describe('dedup check', () => {
  it('counts unique tile textures', () => {
    const out: string[] = [];
    for (const pc of [2, 3, 4]) {
      const map = generateMap(pc, 42);
      const keys = new Set(map.tiles.map((t) => `${t.terrain}|${tileElevation(t, 40)}`));
      out.push(`players=${pc} unique tile combos=${keys.size} (tiles=${map.tiles.length})`);
    }
    console.log(out.join('\n'));
  });
});
```

Run: `npx vitest run <file>`
Expected: unique combos ≈ 20-40 (down from ~170). Remove the temp test after.

- [ ] **Step 2: Commit (if the check was committed) — otherwise skip**

If the temporary file was added to `tests/`, remove it and ensure `git status` is clean.

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a 4-player game.
Check:
- Map renders with slightly stepped hill heights (subtle terracing).
- Units, village labels, territory borders, reachable/attackable highlights, and clicks all
  align with tile faces.
- Move animations and fog reveals look correct.
