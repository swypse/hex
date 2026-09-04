# Science Skill and Ring Skill Tree Design

Date: 2026-08-22

## Problem

Three related changes to the skill system:

1. Add a new level-1 skill, "Science" (cost 3 money), that gates Geology.
2. Move Geology from under Climbing to under Science.
3. Redesign the skill tree screen as concentric rings: tribe name at center, then a ring
   per skill level (level 1 innermost, level 2 next, level 3+ outward), skills distributed
   evenly within each level's ring.

## Design

### 1. New Science skill (`src/game/skills.ts`)

- Add `'science'` to the `SkillId` union.
- Add to `SKILLS`:

```ts
science: {
  id: 'science',
  name: 'Science',
  level: 1,
  parent: null,
  description: 'Allows advanced research.',
},
```

Cost follows the existing `skillCost = 3 * level` formula → **3 money**.

### 2. Move Geology under Science (`src/game/skills.ts`)

Change `geology.parent` from `'climbing'` to `'science'`. No mechanic change: `buildings.ts`
still grants `+1 ore` via `hasSkill(player, 'geology')`; only the prerequisite path changes.

### 3. Ring layout (`src/screens/SkillTreeScreen.tsx`)

Replace the hardcoded `POS: Record<SkillId, {x,y}>` with dynamic radial positions:

- **Center**: tribe name node (as today).
- **Ring radius per level**: `radius = level * RING_SPACING` where `RING_SPACING = 110`.
- **Distribution within a level**: for `count` skills of that level, place skill `i` at angle
  `(i / count) * 2π`, so they are evenly spaced around the center.
- **Level 1 ring**: Climbing, Water, Forestry, Science (4 nodes).
- **Level 2 ring**: Smithery, Swordsman, Geology, Navigation, Water Temples, Forest Temple
  (6 nodes).
- The layout generalizes: any future level-3 skill lands on the third ring at
  `radius = 330` automatically.
- SVG center `(400, 340)`, viewBox sized to fit the outermost ring (e.g. `800 x 760`).
- Lines still draw from each node to its parent; root nodes' lines go to the center. Opened
  (orange) vs locked (gray) color logic unchanged.
- Node/click/cost/name rendering unchanged; only positions come from the ring math.

## Files touched

- `src/game/skills.ts`
- `tests/skills.test.ts`
- `src/screens/SkillTreeScreen.tsx`

## Testing

- `tests/skills.test.ts` updated: 10 skills now; `skillCost('science') === 3`;
  `SKILLS.geology.parent === 'science'`; `SKILLS.science.parent === null`.
- Existing suite + typecheck pass.
- Manual: skill tree shows tribe name centered, level-1 skills on the inner ring, level-2
  on the outer ring, evenly spaced; opening Science enables Geology.
