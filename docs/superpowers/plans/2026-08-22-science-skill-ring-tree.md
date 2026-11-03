# Science Skill and Ring Skill Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a level-1 Science skill (cost 3) that gates Geology, move Geology under Science, and render the skill tree as concentric per-level rings with the tribe name centered.

**Architecture:** Skill data lives in `src/game/skills.ts` (pure data + helpers, tested). The screen `src/screens/SkillTreeScreen.tsx` replaces its hardcoded position map with computed radial positions grouped by `SKILLS[id].level`.

**Tech Stack:** TypeScript, React 19, SVG, Vite, Vitest.

## Global Constraints

- No new dependencies.
- `skillCost` formula stays `3 * level` (Science = 3 money).
- No mechanic change to Geology; only its prerequisite parent changes.
- Existing suite passes after updating `tests/skills.test.ts`.

---

### Task 1: Add Science skill and move Geology under it

**Files:**
- Modify: `src/game/skills.ts`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Consumes: `SkillId`, `SKILLS`, `skillCost` (existing).
- Produces: `'science'` added to `SkillId`; `SKILLS.science` (level 1, parent null); `SKILLS.geology.parent === 'science'`.

- [ ] **Step 1: Write the failing tests (TDD)**

Update `tests/skills.test.ts`:

a. Update the "defines the nine skills" test to "defines the ten skills":

```ts
  it('defines the ten skills with costs 3 and 6 and correct parents', () => {
    expect(Object.keys(SKILLS)).toHaveLength(10);
    expect(skillCost('climbing')).toBe(3);
    expect(skillCost('water')).toBe(3);
    expect(skillCost('forestry')).toBe(3);
    expect(skillCost('science')).toBe(3);
    expect(skillCost('smithery')).toBe(6);
    expect(skillCost('swordsman')).toBe(6);
    expect(skillCost('geology')).toBe(6);
    expect(skillCost('navigation')).toBe(6);
    expect(skillCost('waterTemples')).toBe(6);
    expect(skillCost('forestTemple')).toBe(6);
    expect(SKILLS.smithery.parent).toBe('climbing');
    expect(SKILLS.swordsman.parent).toBe('climbing');
    expect(SKILLS.geology.parent).toBe('science');
    expect(SKILLS.navigation.parent).toBe('water');
    expect(SKILLS.waterTemples.parent).toBe('water');
    expect(SKILLS.forestTemple.parent).toBe('forestry');
    expect(SKILLS.climbing.parent).toBeNull();
    expect(SKILLS.water.parent).toBeNull();
    expect(SKILLS.forestry.parent).toBeNull();
    expect(SKILLS.science.parent).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — 9 skills found, `science` cost fails, `geology.parent` is `'climbing'`.

- [ ] **Step 3: Implement in `skills.ts`**

a. Add `'science'` to the `SkillId` union (after `'forestry'`):

```ts
export type SkillId =
  | 'climbing'
  | 'smithery'
  | 'swordsman'
  | 'geology'
  | 'water'
  | 'navigation'
  | 'waterTemples'
  | 'forestry'
  | 'forestTemple'
  | 'science';
```

b. Add the skill entry:

```ts
  science: {
    id: 'science',
    name: 'Science',
    level: 1,
    parent: null,
    description: 'Allows advanced research.',
  },
```

c. Change `geology.parent` from `'climbing'` to `'science'`:

```ts
  geology: {
    id: 'geology',
    name: 'Geology',
    level: 2,
    parent: 'science',
    description: 'Mines produce +1 ore per round.',
  },
```

- [ ] **Step 4: Run the skills tests**

Run: `npx vitest run tests/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and full tests**

Run: `npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/skills.ts tests/skills.test.ts
git commit -m "feat: add science skill, move geology under it"
```

---

### Task 2: Ring skill tree layout

**Files:**
- Modify: `src/screens/SkillTreeScreen.tsx`

**Interfaces:**
- Consumes: `SKILLS`, `hasSkill`, `canOpenSkill`, `skillCost`, `SkillId` (imported), `TRIBES`/`tribe.color`.
- Produces: radial positions derived from `SKILLS[id].level`; tribe name at center; per-level rings.

- [ ] **Step 1: Replace the position map with ring math**

Replace the `POS` and `ROOT` constants (lines 7-19) with:

```ts
const RING_SPACING = 110;
const CX = 400;
const CY = 340;
const MAX_LEVEL = Math.max(...Object.values(SKILLS).map((s) => s.level));
const SVG_HEIGHT = CY + RING_SPACING * MAX_LEVEL + 120;

function skillPosition(id: SkillId): { x: number; y: number } {
  const level = SKILLS[id].level;
  const sameLevel = Object.keys(SKILLS).filter((k) => SKILLS[k as SkillId].level === level);
  const index = sameLevel.indexOf(id);
  const count = sameLevel.length;
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const r = level * RING_SPACING;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

const POS = Object.fromEntries(
  (Object.keys(SKILLS) as SkillId[]).map((id) => [id, skillPosition(id)]),
) as Record<SkillId, { x: number; y: number }>;
```

Note: `- Math.PI / 2` rotates the distribution so the first skill of each level sits at the
top, keeping the tree visually balanced. `MAX_LEVEL` and `SVG_HEIGHT` are used for the SVG
size below.

- [ ] **Step 2: Update the SVG size**

Replace `viewBox="0 0 800 620"` with:

```tsx
<svg width={SVG_HEIGHT} height={SVG_HEIGHT} viewBox={`0 0 ${SVG_HEIGHT} ${SVG_HEIGHT}`}>
```

(For the current skills, `MAX_LEVEL = 2`, so `SVG_HEIGHT = 400 + 220 + 120 = 740`.)

- [ ] **Step 3: Update root line drawing**

Replace the three hardcoded root lines (lines 98-103) with a loop over level-1 skills:

```tsx
        {Object.keys(SKILLS)
          .filter((id) => SKILLS[id as SkillId].level === 1)
          .map((id) => {
            const s = POS[id as SkillId];
            const opened = hasSkill(human, id as SkillId);
            return (
              <line
                key={id}
                x1={CX}
                y1={CY}
                x2={s.x}
                y2={s.y}
                stroke={opened ? '#ff8c00' : '#555'}
                strokeWidth={opened ? 4 : 2}
              />
            );
          })}
```

- [ ] **Step 4: Update the center node**

Replace the hardcoded center circle/text (lines 105-108) with `CX`/`CY`:

```tsx
        <circle cx={CX} cy={CY} r={34} fill={rootColor} stroke="#fff" strokeWidth={3} />
        <text x={CX} y={CY} textAnchor="middle" dy=".35em" fill="#fff" fontSize="12">
          {tribe.name}
        </text>
```

The `nodes` and `lines` blocks already use `POS` for every skill and its parent, so they
work unchanged with the computed `POS`.

- [ ] **Step 5: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/screens/SkillTreeScreen.tsx
git commit -m "feat: render skill tree as concentric per-level rings"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, open the skill tree from a game.
Check:
- Tribe name is centered.
- Level-1 skills (Climbing, Water, Forestry, Science) sit on the inner ring, evenly spaced.
- Level-2 skills (Smithery, Swordsman, Geology, Navigation, Water Temples, Forest Temple)
  sit on the outer ring, evenly spaced.
- Lines connect each skill to its parent (Geology points to Science, not Climbing).
- Opening Science costs 3 money and then enables Geology.
- The SVG is large enough that no node is clipped.
