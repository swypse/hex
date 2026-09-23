# Roads Skill Design

Date: 2026-08-22

## Problem

Roads are currently buildable without any prerequisite. Add a "Roads" skill that gates
road building: it should be a child of Forestry and cost 6 money.

## Design

### 1. New skill (`src/game/skills.ts`)

- Add `'roads'` to the `SkillId` union.
- Add to `SKILLS`:

```ts
roads: {
  id: 'roads',
  name: 'Roads',
  level: 2,
  parent: 'forestry',
  description: 'Allows building roads between villages.',
},
```

Cost follows the existing `skillCost = 3 * level` formula → `3 * 2 = 6` money.

### 2. Gate road building (`src/game/roads.ts`)

In `canBuildRoad`, require the skill:

```ts
if (!hasSkill(player, 'roads')) return false;
```

`buildRoad` delegates to `canBuildRoad`, so the gate applies to both the simulator and the
toolbar. The "Build a road (2w, 1s)" button only appears when `canBuildRoad` is true, so it
is hidden until the skill is opened.

### 3. Tests

- `tests/skills.test.ts`: 11 skills now; `SKILLS.roads.parent === 'forestry'`;
  `skillCost('roads') === 6`; `SKILLS.forestry.parent` still `null`.
- `tests/roads.test.ts`: `canBuildRoad` returns `false` when the player lacks the `roads`
  skill and `true` once the player has it (with an adjacent village/road).

## Files touched

- `src/game/skills.ts`
- `src/game/roads.ts`
- `tests/skills.test.ts`
- `tests/roads.test.ts`

## Testing

- Existing suite + `npm run typecheck` pass.
- Manual: without the skill, no "Build a road" button appears; after opening Roads
  (requires Forestry, 6 money), the button appears and road building works.
