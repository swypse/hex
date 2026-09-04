# Radial Skill Tree Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the skill tree so skills radiate outward from the center along rays and parent→child edges never intersect.

**Architecture:** Replace the ring-based `ringOrder`/`skillPosition` computation in `src/ui/overlays/SkillTree.ts` with an exported pure `skillLayout()` that builds a radial tidy tree: each leaf gets a unique angle via an in-order walk, each internal node sits at its children's midpoint angle, and radius = tree depth × `RING_SPACING`. The existing render code consumes the positions unchanged.

**Tech Stack:** TypeScript, PixiJS, Vitest.

## Global Constraints

- Radius = tree depth × `RING_SPACING` (`110`); roots at depth 1, children at depth 2. Center `CX = 400`, `CY = 340`.
- Leaves are assigned unique angles `(leafIndex / leafCount) * 2π - π/2`; internal nodes take the midpoint angle of their children, so every subtree occupies one contiguous angular interval → no proper edge crossings.
- The render code (`POS`, lines from parent to child, node circles/labels, root circle) keeps using the same positions — only the computation changes.
- No change to skill data, costs, zoom/pan, or the detail modal.
- No comments in code unless asked.
- Commit after every task.

---

### Task 1: Radial skill tree layout

**Files:**
- Modify: `src/ui/overlays/SkillTree.ts`
- Test: `tests/skillTreeLayout.test.ts` (new)

**Interfaces:**
- Consumes: `SKILLS`, `SkillId` from `../../game/skills` (already imported in the file).
- Produces:
  - `interface SkillNodeLayout { x: number; y: number; depth: number; radius: number }`
  - `export function skillLayout(): Record<SkillId, SkillNodeLayout>` — absolute render coordinates (`x`, `y`) plus `depth`/`radius`.
  - `const POS = skillLayout()` replaces the old `POS`.

- [ ] **Step 1: Write the failing test**

Create `tests/skillTreeLayout.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SKILLS, type SkillId } from '../src/game/skills';
import { skillLayout } from '../src/ui/overlays/SkillTree';

describe('skill tree layout', () => {
  const layout = skillLayout();

  it('places every child farther from the center than its parent', () => {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      const parent = SKILLS[id].parent;
      if (!parent) continue;
      expect(layout[id].radius).toBeGreaterThan(layout[parent].radius);
    }
  });

  it('does not intersect parent-child edges', () => {
    const edges = (Object.keys(SKILLS) as SkillId[])
      .filter((id) => SKILLS[id].parent !== null)
      .map((id) => ({ a: layout[SKILLS[id].parent!], b: layout[id] }));
    const cross = (
      ax: number, ay: number, bx: number, by: number,
      cx: number, cy: number, dx: number, dy: number,
    ): boolean =>
      ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) * ((bx - ax) * (dy - ay) - (by - ay) * (dx - ax)) < 0 &&
      ((dx - cx) * (ay - cy) - (dy - cy) * (ax - cx)) * ((dx - cx) * (by - cy) - (dy - cy) * (bx - cx)) < 0;
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i];
        const e2 = edges[j];
        const sharesVertex =
          (e1.a.x === e2.a.x && e1.a.y === e2.a.y) ||
          (e1.a.x === e2.b.x && e1.a.y === e2.b.y) ||
          (e1.b.x === e2.a.x && e1.b.y === e2.a.y) ||
          (e1.b.x === e2.b.x && e1.b.y === e2.b.y);
        if (sharesVertex) continue;
        expect(
          cross(e1.a.x, e1.a.y, e1.b.x, e1.b.y, e2.a.x, e2.a.y, e2.b.x, e2.b.y),
          `edges intersect`,
        ).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- skillTreeLayout.test.ts`
Expected: FAIL — `skillLayout` is not exported from `SkillTree`.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/overlays/SkillTree.ts`, replace the `ringOrder` function, the `skillPosition` function, and the `POS` constant (lines ~16-42) with:

```ts
export interface SkillNodeLayout {
  x: number;
  y: number;
  depth: number;
  radius: number;
}

export function skillLayout(): Record<SkillId, SkillNodeLayout> {
  const childrenOf = new Map<SkillId, SkillId[]>();
  const roots: SkillId[] = [];
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const parent = SKILLS[id].parent;
    if (parent) {
      const arr = childrenOf.get(parent) ?? [];
      arr.push(id);
      childrenOf.set(parent, arr);
    } else {
      roots.push(id);
    }
  }
  const leafCount = (Object.keys(SKILLS) as SkillId[]).filter((id) => {
    const kids = childrenOf.get(id);
    return !kids || kids.length === 0;
  }).length;

  const angle = new Map<SkillId, number>();
  const depth = new Map<SkillId, number>();
  let leaf = 0;
  const assign = (id: SkillId, d: number): void => {
    depth.set(id, d);
    const kids = childrenOf.get(id) ?? [];
    if (kids.length === 0) {
      angle.set(id, (leaf / leafCount) * 2 * Math.PI - Math.PI / 2);
      leaf++;
      return;
    }
    for (const k of kids) assign(k, d + 1);
    const first = angle.get(kids[0])!;
    const last = angle.get(kids[kids.length - 1])!;
    angle.set(id, (first + last) / 2);
  };
  for (const r of roots) assign(r, 1);

  const out = {} as Record<SkillId, SkillNodeLayout>;
  for (const id of Object.keys(SKILLS) as SkillId[]) {
    const radius = depth.get(id)! * RING_SPACING;
    const a = angle.get(id)!;
    out[id] = { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a), depth: depth.get(id)!, radius };
  }
  return out;
}

const POS = skillLayout();
```

The render code (`build()` and the line drawing using `POS[parent]` / `POS[id]`) already reads `x`/`y`, so it needs no other changes. `ringOrder` and `skillPosition` are no longer referenced anywhere.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- skillTreeLayout.test.ts skillTree.test.ts`
Expected: PASS (new layout tests plus the existing zoom/pan tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/SkillTree.ts tests/skillTreeLayout.test.ts
git commit -m "feat: radial skill tree layout with non-intersecting rays"
```

---

### Task 2: Full verification

**Files:**
- None.

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm nothing stray was left uncommitted**

Run: `git status`
Expected: no modified tracked files.
