# Roads Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Roads" skill (child of Forestry, cost 6) and require it to build roads.

**Architecture:** Add the skill to `skills.ts`; gate `canBuildRoad` on `hasSkill(player, 'roads')`. Because `buildRoad` delegates to `canBuildRoad` and the toolbar uses it, both the simulator and UI are gated automatically.

**Tech Stack:** TypeScript, Vite, Vitest.

## Global Constraints

- No new dependencies.
- Skill cost uses the existing `3 * level` formula → Roads (level 2) = 6 money.
- `canBuildRoad` must still enforce all existing rules (terrain, settlement, building, enemy unit, adjacency, cost).
- Existing 300 tests pass; `npm run typecheck` clean.

---

### Task 1: Add the Roads skill

**Files:**
- Modify: `src/game/skills.ts`
- Test: `tests/skills.test.ts`

**Interfaces:**
- Produces: `SkillId` gains `'roads'`; `SKILLS.roads` = `{ level: 2, parent: 'forestry', name: 'Roads', description: ... }`.

- [ ] **Step 1: Write failing tests (TDD)**

Update `tests/skills.test.ts`:

a. Change the "defines the ten skills" test to "eleven skills" and add Roads assertions:

```ts
  it('defines the eleven skills with costs 3 and 6 and correct parents', () => {
    expect(Object.keys(SKILLS)).toHaveLength(11);
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
    expect(skillCost('roads')).toBe(6);
    expect(SKILLS.smithery.parent).toBe('climbing');
    expect(SKILLS.swordsman.parent).toBe('climbing');
    expect(SKILLS.geology.parent).toBe('science');
    expect(SKILLS.navigation.parent).toBe('water');
    expect(SKILLS.waterTemples.parent).toBe('water');
    expect(SKILLS.forestTemple.parent).toBe('forestry');
    expect(SKILLS.roads.parent).toBe('forestry');
    expect(SKILLS.climbing.parent).toBeNull();
    expect(SKILLS.water.parent).toBeNull();
    expect(SKILLS.forestry.parent).toBeNull();
    expect(SKILLS.science.parent).toBeNull();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — 10 skills found, `skillCost('roads')` throws.

- [ ] **Step 3: Implement in `skills.ts`**

a. Add `'roads'` to the `SkillId` union (after `'science'`):

```ts
  | 'science'
  | 'roads';
```

b. Add the skill entry (after `science`):

```ts
  roads: {
    id: 'roads',
    name: 'Roads',
    level: 2,
    parent: 'forestry',
    description: 'Allows building roads between villages.',
  },
```

- [ ] **Step 4: Run the skills tests**

Run: `npx vitest run tests/skills.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/skills.ts tests/skills.test.ts
git commit -m "feat: add Roads skill under Forestry"
```

---

### Task 2: Gate road building on the skill

**Files:**
- Modify: `src/game/roads.ts`
- Test: `tests/roads.test.ts`

**Interfaces:**
- Consumes: `hasSkill` from `./skills`.
- Produces: `canBuildRoad` returns `false` unless the player has the `'roads'` skill.

- [ ] **Step 1: Update the roads test helper and add failing tests**

In `tests/roads.test.ts`, extend the `player` helper to accept skills:

```ts
import { SkillId } from '../src/game/skills';
```

```ts
function player(money = 100, wood = 10, stone = 10, index = 0, skills: SkillId[] = []): Player {
  return {
    index, tribe: Tribe.Villagers, isHuman: true, name: 'p',
    resources: { wood, stone, money, ore: 0 },
    score: 0, kills: 0, skills, isActive: true,
  };
}
```

Add tests:

```ts
  it('requires the Roads skill', () => {
    const map = mapWith([
      villageTile(0, 0, 0),
      tile(1, 0, TileType.GrasslandLand),
    ]);
    expect(canBuildRoad(map, map.tiles[1], player())).toBe(false);
    expect(canBuildRoad(map, map.tiles[1], player(100, 10, 10, 0, ['forestry', 'roads']))).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/roads.test.ts`
Expected: the new test fails (no skill gate yet); note the existing tests now fail too because
`player()` lacks the skill. Update existing `canBuildRoad`/`buildRoad` positive tests to pass
`['forestry', 'roads']` in their `player(...)` calls (adjacent-village, adjacent-road, and the
simulator test which uses `buildPlayers`).

For the simulator test, the AI/human player must have the skill. Since `buildPlayers` sets no
skills, gate the simulator test by giving player 0 the skill after construction:

```ts
    players[0].skills = ['forestry', 'roads'];
```

- [ ] **Step 3: Implement in `roads.ts`**

Add the import and the gate:

```ts
import { hasSkill } from './skills';
```

```ts
export function canBuildRoad(map: GameMap, tile: MapTile, player: Player): boolean {
  if (!hasSkill(player, 'roads')) return false;
  ...
}
```

- [ ] **Step 4: Run the roads tests**

Run: `npx vitest run tests/roads.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/game/roads.ts tests/roads.test.ts
git commit -m "feat: require Roads skill to build roads"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a single-player game.
Check:
- Before opening Roads, no "Build a road" button appears next to a village.
- Opening Forestry (3) then Roads (6 money) makes the button appear.
- Road building still costs 2 wood + 1 stone and draws orange spokes.
