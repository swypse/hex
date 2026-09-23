# Skill Tree Ring Grouping by Parent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group each skill ring by parent so children of the same parent sit contiguously, ordered by the previous ring's parent order.

**Architecture:** Replace the per-level `filter` + declaration-index logic in `src/screens/SkillTreeScreen.tsx` with a recursive `ringOrder(level)` that emits children grouped by the previous ring's order.

**Tech Stack:** TypeScript, React 19, SVG, Vite, Vitest.

## Global Constraints

- No new dependencies.
- No change to `SKILLS` data or game logic.
- Ring radius and spacing stay the same; only ring *order* changes.
- Existing 287 tests pass; `npm run typecheck` clean.

---

### Task 1: Group ring order by parent

**Files:**
- Modify: `src/screens/SkillTreeScreen.tsx:7-25`

**Interfaces:**
- Consumes: `SKILLS`, `SkillId` (imported).
- Produces: `ringOrder(level: number): SkillId[]` — level 1 returns roots in declaration order; level L returns children grouped by the level-(L-1) order. `skillPosition(id)` uses `ringOrder(SKILLS[id].level)`.

- [ ] **Step 1: Add the recursive `ringOrder` helper and update `skillPosition`**

Replace lines 13-25 of `src/screens/SkillTreeScreen.tsx` (the current `skillPosition` and `POS` block) with:

```ts
function ringOrder(level: number): SkillId[] {
  if (level === 1) {
    return (Object.keys(SKILLS) as SkillId[]).filter((id) => SKILLS[id].level === 1);
  }
  const prev = ringOrder(level - 1);
  const out: SkillId[] = [];
  for (const p of prev) {
    for (const id of Object.keys(SKILLS) as SkillId[]) {
      if (SKILLS[id].level === level && SKILLS[id].parent === p) out.push(id);
    }
  }
  return out;
}

function skillPosition(id: SkillId): { x: number; y: number } {
  const level = SKILLS[id].level;
  const order = ringOrder(level);
  const index = order.indexOf(id);
  const count = order.length;
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const r = level * RING_SPACING;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

const POS = Object.fromEntries(
  (Object.keys(SKILLS) as SkillId[]).map((id) => [id, skillPosition(id)]),
) as Record<SkillId, { x: number; y: number }>;
```

The level-1 ring order is unchanged (`[climbing, water, forestry, science]`). Level-2 now
groups children by parent in that order:
`[smithery, swordsman, navigation, waterTemples, forestTemple, geology]`.

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. `ringOrder` and `POS` are used by the existing `lines` and `nodes`
blocks unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/screens/SkillTreeScreen.tsx
git commit -m "feat: group skill tree rings by parent order"
```

---

### Task 2: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, open the skill tree.
Check:
- Level-1 ring: Climbing, Water, Forestry, Science in the same positions as before.
- Level-2 ring groups children by parent: Smithery+Swordsman, then Navigation+Water Temples,
  then Forest Temple, then Geology.
- Parent-child lines do not cross.
