# Mountain Density Halving & Symmetric Skill Tree Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halve natural mountain density on generated maps (~20% -> ~10% of tiles) and rework the skill tree into a symmetric layout with equal 60° sectors per root branch.

**Architecture:** Two independent changes. Mountain density is a one-line threshold change in `generateTerrain` plus matching test/doc updates. The skill layout swaps the current midpoint-of-leaves algorithm in `skillLayout()` for recursive equal-sector allocation, keeping the exported `Record<SkillId, SkillNodeLayout>` shape.

**Tech Stack:** TypeScript, Vitest, PixiJS. No dependency changes.

## Global Constraints

- Work in the repo root: `/home/user/games/hex`.
- The repo working tree already contains many unrelated uncommitted changes (unit stats, knights, AI tweaks, etc.). **Never run `git add -A`/`git add .`.** Stage only the exact files each task lists. For `GAME.md`, stage only the Map-section sentence hunk (use `git add -p GAME.md` and select that one hunk); leave all other hunks unstaged.
- Focused test runner: `npx vitest run <file>`. Full suite: `npm test`. Typecheck: `npm run typecheck`.
- Do not add code comments. Match existing style (no new libraries, existing constants/patterns).
- Spec: `docs/superpowers/specs/2026-09-03-mountain-density-skill-tree-layout-design.md`.

---

### Task 1: Halve mountain density to ~10%

**Files:**
- Modify: `src/game/biomes.ts:96` (mountain threshold)
- Modify: `tests/biomes.test.ts:73-89` (density case)
- Modify: `tests/mapGen.test.ts:62-87` (wild density case)
- Modify: `GAME.md:195` (map description sentence)
- Test: `tests/biomes.test.ts`, `tests/mapGen.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks. Uses existing `percentile(heights, p)` and `generateTerrain(tiles, seed)`.
- Produces: `generateTerrain` still mutates tiles in place; only the mountain share changes (~0.117 on the biomes test grid, ~0.126 wild on `generateMap(3, 42)`).

Measured baselines (deterministic, fixed seeds) with current code: biomes grid ~0.217 mountain; mapGen wild ~0.229 mountain. After the change: ~0.117 and ~0.126 respectively.

- [ ] **Step 1: Tighten the biomes density test (red)**

In `tests/biomes.test.ts` change the case at lines 73-89:

```ts
  it('produces roughly 40% water and 10% mountains on a large map', () => {
```

and replace the two mountain expectations:

```ts
    expect(mountain).toBeGreaterThan(0.09);
    expect(mountain).toBeLessThan(0.14);
```

Keep the water expectations (`0.35` / `0.45`) and all other code in the case unchanged.

- [ ] **Step 2: Tighten the mapGen wild density test (red)**

In `tests/mapGen.test.ts` change the case title at line 62:

```ts
  it('produces roughly 40% water and 10% mountains away from villages', () => {
```

and replace the two mountain expectations:

```ts
    expect(mountain).toBeGreaterThan(0.09);
    expect(mountain).toBeLessThan(0.16);
```

Keep the water expectations (`0.32` / `0.48`) and the surrounding `wild` computation unchanged.

- [ ] **Step 3: Run both tests to verify they fail**

Run: `npx vitest run tests/biomes.test.ts tests/mapGen.test.ts`
Expected: FAIL — `biomes` mountain 0.217 is not `< 0.14`; `mapGen` mountain 0.229 is not `< 0.16`.

- [ ] **Step 4: Lower the mountain threshold**

In `src/game/biomes.ts:96` change:

```ts
  const mountainThreshold = percentile(heights, 0.8);
```

to:

```ts
  const mountainThreshold = percentile(heights, 0.9);
```

- [ ] **Step 5: Run the two tests to verify they pass**

Run: `npx vitest run tests/biomes.test.ts tests/mapGen.test.ts`
Expected: PASS. (`biomes` mountain ≈ 0.117; `mapGen` wild mountain ≈ 0.126.)

- [ ] **Step 6: Run the related suites**

Run: `npx vitest run tests/biomes.test.ts tests/mapGen.test.ts tests/buildings.test.ts tests/resources.test.ts tests/claim.test.ts`
Expected: PASS — the "guarantees a mountain and a forest within distance 2 of every starting village" case in `mapGen.test.ts:134` must still pass (it relies on `ensureResourceNearVillage`, which is untouched).

- [ ] **Step 7: Update the GAME.md map description**

In `GAME.md`, the Map section line currently reads (line ~195):

```text
  Rainforest. Roughly 40% water, 20% mountains, the rest land and forest.
```

Change to:

```text
  Rainforest. Roughly 40% water, 10% mountains, the rest land and forest.
```

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/game/biomes.ts tests/biomes.test.ts tests/mapGen.test.ts
git add -p GAME.md   # stage ONLY the Map-section "20% mountains" hunk
git commit -m "feat: halve mountain density to about 10% of map tiles"
```

Verify with `git status` that no unrelated files were staged.

---

### Task 2: Symmetric skill tree layout (equal 60° sectors)

**Files:**
- Modify: `src/ui/overlays/SkillTree.ts:37-58` (the layout core inside `skillLayout()`)
- Modify: `tests/skillTreeLayout.test.ts` (add two assertions)
- Test: `tests/skillTreeLayout.test.ts`, `tests/skillTree.test.ts`

**Interfaces:**
- Consumes: `SKILLS` / `SkillId` from `../game/skills` (unchanged). `skillLayout()` still takes no arguments.
- Produces: unchanged exported shape — `Record<SkillId, SkillNodeLayout>` where `SkillNodeLayout = { x; y; depth; radius }` with `depth` starting at 1 for roots and `radius = depth * RING_SPACING`. `CX = 400`, `CY = 340`, `RING_SPACING = 110` are unchanged. Consumers (the `POS` table and `SkillTree.build()` node/edge rendering) are untouched.

The reworked core: six roots each get an equal `2π/6` slice; every node sits at its slice center and recursively subdivides its slice among its children. Resulting root angles from the +x axis: 30°, 90°, 150°, 210°, 270°, 330° (every 60°).

- [ ] **Step 1: Add the new layout assertions (red on spacing)**

Append to `tests/skillTreeLayout.test.ts` inside the existing `describe` block. Add after line 14 (after the existing first `it`):

```ts
  const CX = 400;
  const CY = 340;
  const centerAngle = (id: SkillId): number => Math.atan2(layout[id].y - CY, layout[id].x - CX);

  it('spaces the six root skills evenly at 60 degrees', () => {
    const roots = (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].parent === null);
    expect(roots.length).toBe(6);
    const angles = roots.map(centerAngle).sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const a = angles[i]!;
      const b = angles[(i + 1) % angles.length]!;
      const gap = i === angles.length - 1 ? a - b + 2 * Math.PI : b - a;
      expect(gap).toBeCloseTo((2 * Math.PI) / 6, 5);
    }
  });

  it('sits every parent at the center of its children span', () => {
    const childIds = (id: SkillId): SkillId[] =>
      (Object.keys(SKILLS) as SkillId[]).filter((k) => SKILLS[k].parent === id);
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const kids = childIds(id);
      if (kids.length === 0) continue;
      const a = centerAngle(id);
      const childAngles = kids.map(centerAngle).sort((x, y) => x - y);
      const mid = (childAngles[0]! + childAngles[childAngles.length - 1]!) / 2;
      expect(a).toBeCloseTo(mid, 5);
    }
  });
```

(`CX`/`CY` are module-local constants in `SkillTree.ts`; duplicating their values in the test is intended. The `centerAngle` helper must be declared after `layout` so it can reference it.)

- [ ] **Step 2: Run the layout tests to verify the spacing test fails**

Run: `npx vitest run tests/skillTreeLayout.test.ts`
Expected: FAIL — the new even-spacing test fails on current root gaps (72°/72°/72°/54°/36°/54°). The children-span test and the three existing tests pass.

- [ ] **Step 3: Replace the layout core with equal-sector allocation**

In `src/ui/overlays/SkillTree.ts`, replace the body of `skillLayout()` from the `const leafCount = ...` line through the `return out;` statement (current lines 37-66) with:

```ts
  const angle = new Map<SkillId, number>();
  const depth = new Map<SkillId, number>();
  const rootSector = (2 * Math.PI) / roots.length;
  const assign = (id: SkillId, start: number, end: number, d: number): void => {
    depth.set(id, d);
    angle.set(id, (start + end) / 2);
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) return;
    const width = (end - start) / kids.length;
    for (let i = 0; i < kids.length; i++) {
      assign(kids[i]!, start + i * width, start + (i + 1) * width, d + 1);
    }
  };
  for (let i = 0; i < roots.length; i++) {
    assign(roots[i]!, i * rootSector, (i + 1) * rootSector, 1);
  }

  const out = {} as Record<SkillId, SkillNodeLayout>;
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const radius = depth.get(id)! * RING_SPACING;
    const a = angle.get(id)!;
    out[id] = { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a), depth: depth.get(id)!, radius };
  }
  return out;
```

This removes the now-unused `leafCount`, `let leaf`, and midpoint (`first`/`last`) bookkeeping. The `childrenOf`/`roots` build at the top of the function (lines 25-36) stays as is.

- [ ] **Step 4: Run the layout tests to verify they pass**

Run: `npx vitest run tests/skillTreeLayout.test.ts`
Expected: PASS — all five cases (three existing + two new), including "does not intersect parent-child edges" (equal sectors keep each branch in its own non-overlapping wedge).

- [ ] **Step 5: Run the skill tree smoke tests**

Run: `npx vitest run tests/skillTree.test.ts`
Expected: PASS — zoom/pan behavior is unaffected.

- [ ] **Step 6: Sanity-check no circle or label overlap**

Confirm the closest node centers clear the 56 px circles by measuring the real layout (drop-in vitest measurement, then delete it):

```ts
import { it } from 'vitest';
import { SKILLS, type SkillId } from '../src/game/skills';
import { skillLayout } from '../src/ui/overlays/SkillTree';

it('measure', () => {
  const L = skillLayout();
  const ids = Object.keys(SKILLS) as SkillId[];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  let min = Infinity; let pair = '';
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = dist(L[ids[i]!], L[ids[j]!]);
    if (d < min) { min = d; pair = `${ids[i]} <-> ${ids[j]}`; }
  }
  console.log('min node-center separation px:', min.toFixed(1), pair);
});
```

Expected: min separation ≈ 110 px (adjacent inner-ring roots, 60° apart at radius 110 → `2*110*sin(30°) = 110`), which clears the 56 px circle diameter by 54 px. No overlaps.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/ui/overlays/SkillTree.ts tests/skillTreeLayout.test.ts
git commit -m "style: redistribute skill tree into equal 60-degree branch sectors"
```

Verify with `git status` that no unrelated files were staged.

---

## Self-review checklist

- **Spec coverage:**
  - Task 1 covers the `0.9` threshold, both density test updates, the `GAME.md` sentence, and the "mountain near village" guarantee that must keep passing.
  - Task 2 covers the equal-60° root spacing, per-parent sector centering, removal of dead midpoint bookkeeping, preserved exports/depths, and no-overlap geometry.
- **Placeholder scan:** none — every step has concrete code or commands.
- **Type consistency:** `skillLayout(): Record<SkillId, SkillNodeLayout>` unchanged; `assign` is internal; `roots.length` is 6 by construction; test helpers reference existing `SkillId` and `layout`. `SkillTree.build()` consumes `POS[id].x/y` only, so no downstream edits needed.
