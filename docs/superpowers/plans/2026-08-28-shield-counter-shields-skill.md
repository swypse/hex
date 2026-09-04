# Shield Counter-attack, Shields & Defence Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a defending shield counter with `round(7 × hp / maxHp)`, gate shield spawning behind a new Shields skill, and add a Defence skill (future "Build village walls" action).

**Architecture:** Add `counterAttackDamage` in `combat.ts` (base 7 for shields, else the existing attack base) and use it for the defender's retaliation in `performAttack`. Add `shields` (level 1) and `defence` (level 2, parent `shields`) to the `SKILLS` registry; gate shield spawns in `spawnUnit` and surface the reason in the Spawn dialog. The SkillTree and AI pick up the new skills automatically.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Shield counter-attack formula: `round(7 × hp / maxHp)`, only when the shield is the defender; the shield's own attack stays base 1 (hp-scaled).
- Shields skill: level 1, parent `null`, base cost 3.
- Defence skill: level 2, parent `shields`, base cost 6, no action UI.
- Run `npm test` and `npm run typecheck` after each task; output must be clean.

---

### Task 1: Shield counter-attack

**Files:**
- Modify: `src/game/combat.ts`
- Modify: `tests/combat.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: `Unit`, `UNIT_TYPES`, `shipAttack` (all already imported in `combat.ts`).
- Produces: `counterAttackDamage(unit: Unit): number` — `round(base × hp / maxHp)` where `base` is `7` for shields, else `shipAttack(unit)`. Used by `performAttack` for the defender's retaliation.

- [ ] **Step 1: Write failing tests**

Add to `tests/combat.test.ts`. Update the import on line 3:

```ts
import { attackDamage, attackableTargets, chooseBestAttack, counterAttackDamage, MISS_CHANCE, performAttack } from '../src/game/combat';
```

Add a helper after `makeWarrior`:

```ts
function makeShield(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'shield', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 1, attackDistance: 1, spawnVillage: null };
}
```

Add a describe block after the `attackDamage` block:

```ts
describe('counterAttackDamage', () => {
  it('scales a shield counter-attack by 7', () => {
    expect(counterAttackDamage(makeShield('s', 0, 0, 0, 10))).toBe(7);
    expect(counterAttackDamage(makeShield('s', 0, 0, 0, 5))).toBe(4);
    expect(counterAttackDamage(makeShield('s', 0, 0, 0, 1))).toBe(1);
  });

  it('keeps non-shield counter-attacks at the normal attack scaling', () => {
    expect(counterAttackDamage(makeWarrior('w', 0, 0, 0, 5))).toBe(2);
  });
});
```

Add a `performAttack` case inside the `performAttack` describe block:

```ts
it('a defending shield counters with 7-based damage', () => {
  const map: GameMap = { radius: 4, tiles: [], spawns: [] };
  const attacker = makeWarrior('a', 0, 0, 0, 5);
  const shield = makeTile(1, 0, TileType.GrasslandLand, makeShield('s', 1, 1, 0, 10));
  map.tiles.push(makeTile(0, 0, TileType.GrasslandLand, attacker), shield);
  const result = performAttack(map, attacker, shield, noMiss);
  expect(result.attackerDamage).toBe(2);
  expect(result.targetDamage).toBe(7);
  expect(shield.unit!.hp).toBe(8);
  expect(attacker.hp).toBe(0);
  expect(result.attackerDied).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `counterAttackDamage is not a function`, and the defending-shield case still returns the old counter damage (`1`).

- [ ] **Step 3: Implement `counterAttackDamage` and use it**

In `src/game/combat.ts`, add after `attackDamage`:

```ts
export function counterAttackDamage(unit: Unit): number {
  const base = unit.type === 'shield' ? 7 : shipAttack(unit);
  return Math.round((base * unit.hp) / UNIT_TYPES[unit.type].maxHp);
}
```

In `performAttack`, replace the counter-attack damage line:

```ts
  if (!targetDied && distance <= targetUnit.attackDistance) {
    targetDamage = counterAttackDamage(targetUnit);
```

- [ ] **Step 4: Update GAME.md**

In `GAME.md`, in the "Attack" bullet under "Unit actions", extend the counter-attack sentence to:

```
  If the target survives and is in
  range, it counter-attacks. A defending shield counters with `round(7 × current
  hp / max hp)`.
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/combat.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts GAME.md
git commit -m "feat: shield counter-attack deals round(7 * hp / maxHp)"
```

---

### Task 2: Shields and Defence skills

**Files:**
- Modify: `src/game/skills.ts`
- Modify: `tests/skills.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: existing `SkillId`, `SKILLS`, `skillCost` structure.
- Produces: `'shields'` (level 1, parent `null`, base cost 3) and `'defence'` (level 2, parent `'shields'`, base cost 6) added to the `SkillId` union and `SKILLS`.

- [ ] **Step 1: Write failing tests**

In `tests/skills.test.ts`, replace the first test with an updated version:

```ts
it('defines the thirteen skills with base costs 3 and 6 and correct parents', () => {
  expect(Object.keys(SKILLS)).toHaveLength(13);
  expect(skillCost('climbing', 0)).toBe(3);
  expect(skillCost('water', 0)).toBe(3);
  expect(skillCost('forestry', 0)).toBe(3);
  expect(skillCost('science', 0)).toBe(3);
  expect(skillCost('shields', 0)).toBe(3);
  expect(skillCost('smithery', 0)).toBe(6);
  expect(skillCost('swordsman', 0)).toBe(6);
  expect(skillCost('geology', 0)).toBe(6);
  expect(skillCost('navigation', 0)).toBe(6);
  expect(skillCost('waterTemples', 0)).toBe(6);
  expect(skillCost('forestTemple', 0)).toBe(6);
  expect(skillCost('roads', 0)).toBe(6);
  expect(skillCost('defence', 0)).toBe(6);
  expect(SKILLS.smithery.parent).toBe('climbing');
  expect(SKILLS.swordsman.parent).toBe('climbing');
  expect(SKILLS.geology.parent).toBe('science');
  expect(SKILLS.navigation.parent).toBe('water');
  expect(SKILLS.waterTemples.parent).toBe('water');
  expect(SKILLS.forestTemple.parent).toBe('forestry');
  expect(SKILLS.roads.parent).toBe('forestry');
  expect(SKILLS.defence.parent).toBe('shields');
  expect(SKILLS.climbing.parent).toBeNull();
  expect(SKILLS.water.parent).toBeNull();
  expect(SKILLS.forestry.parent).toBeNull();
  expect(SKILLS.science.parent).toBeNull();
  expect(SKILLS.shields.parent).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/skills.test.ts`
Expected: FAIL — `Object.keys(SKILLS)` has length 11, not 13, and `skillCost('shields', 0)` throws (`SKILLS[id]` is undefined).

- [ ] **Step 3: Implement the skills**

In `src/game/skills.ts`, extend the `SkillId` union:

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
  | 'science'
  | 'roads'
  | 'shields'
  | 'defence';
```

Add two entries to `SKILLS` (e.g., after `roads`):

```ts
  shields: {
    id: 'shields',
    name: 'Shields',
    level: 1,
    parent: null,
    description: 'Allows spawning shield units (10 money).',
  },
  defence: {
    id: 'defence',
    name: 'Defence',
    level: 2,
    parent: 'shields',
    description: 'Unlocks the Build village walls action (coming soon).',
  },
```

- [ ] **Step 4: Update GAME.md skills table**

In `GAME.md`, add two rows to the Skills table:

```
| Shields      | 1     | —        | Allows spawning shield units                                                      |
| Defence      | 2     | Shields  | Unlocks the Build village walls action (coming soon)                              |
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/skills.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/skills.ts tests/skills.test.ts GAME.md
git commit -m "feat: add Shields and Defence skills"
```

---

### Task 3: Shield spawn gating

**Files:**
- Modify: `src/game/spawn.ts`
- Modify: `src/ui/overlays/SpawnDialog.ts`
- Modify: `tests/spawn.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: `hasSkill` from `skills.ts`; the `'shields'` skill id from Task 2.
- Produces: shield spawns rejected without the Shields skill; Spawn dialog shows the "Requires the Shields skill" reason.

- [ ] **Step 1: Write failing tests**

In `tests/spawn.test.ts`, update the existing shield test and add a gating test:

```ts
it('spawns a shield unit for 10 money with 10 hp when the Shields skill is open', () => {
  const map = makeMap();
  const village = map.tiles[0];
  const player = makePlayer(0, 10);
  player.skills = ['shields'];
  expect(spawnUnit(map, village, 'shield', player)).toBe(true);
  expect(village.unit!.type).toBe('shield');
  expect(village.unit!.hp).toBe(10);
  expect(player.resources.money).toBe(0);
});

it('rejects shield spawn without the Shields skill', () => {
  const map = makeMap();
  const village = map.tiles[0];
  const player = makePlayer(0, 10);
  expect(spawnUnit(map, village, 'shield', player)).toBe(false);
  expect(village.unit).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/spawn.test.ts`
Expected: FAIL — the gating test expects `false` but `spawnUnit` returns `true` (no skill gate yet).

- [ ] **Step 3: Implement the gate**

In `src/game/spawn.ts`, extend the skill gate next to the swordsman one:

```ts
  if (type === 'swordsman' && !hasSkill(player, 'swordsman')) return false;
  if (type === 'shield' && !hasSkill(player, 'shields')) return false;
```

In `src/ui/overlays/SpawnDialog.ts`, in `reasons()`, add next to the swordsman reason:

```ts
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) out.push('Requires the Swordsman skill');
    if (type === 'shield' && !hasSkill(player, 'shields')) out.push('Requires the Shields skill');
```

- [ ] **Step 4: Update GAME.md**

In `GAME.md`, in the Units section, extend the unit note:

```
- **Swordsman** additionally requires the *Swordsman* skill.
- **Shield** additionally requires the *Shields* skill.
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/spawn.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/spawn.ts src/ui/overlays/SpawnDialog.ts tests/spawn.test.ts GAME.md
git commit -m "feat: gate shield spawns behind the Shields skill"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Shield counter-attack `round(7 × hp / maxHp)` when defending: Task 1.
- Shields skill (level 1, cost 3) gating shield spawns: Tasks 2 + 3.
- Defence skill (child of Shields, cost 6, no action UI): Task 2.
