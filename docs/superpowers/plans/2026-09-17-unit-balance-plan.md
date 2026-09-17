# Unit Balance Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust unit stats to match Polytopia-style balance ratios — elite units are per-unit stronger but per-cost weaker, and no unit is strictly inferior to a cheaper alternative.

**Architecture:** Single-point change in UNIT_TYPES in `units.ts`, then update all test factories, expected values, and documentation that hardcode the old values.

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- All tests must pass
- No functional changes to combat formula or game logic, only stat values
- Warrior baseline stays unchanged (20 atk, 10 def, 50 HP, cost 4)
- Pirate stats stay unchanged

---

### Task 1: Update UNIT_TYPES in src/game/units.ts

**Files:**
- Modify: `src/game/units.ts:30-39`

This is the single source-of-truth change. All other changes follow from it.

New values:

| Unit | Atk | Def | HP | Cost (money/ore/wood) |
|------|-----|-----|-----|----------------------|
| archer | 20 | 7 | 40 | 6 / 0 / 0 |
| rider | 20 | 7 | 40 | 6 / 0 / 0 |
| swordsman | 40 | 20 | 80 | 10 / 2 / 0 |
| shield | 7 | 20 | 80 | 8 / 2 / 0 |
| catapult | 50 | 0 | 30 | 15 / 3 / 10 |
| knight | 40 | 7 | 60 | 14 / 5 / 0 |

- [ ] **Step 1: Edit UNIT_TYPES constants**

```ts
// Replace lines 30-39 in src/game/units.ts
warrior: { movement: 1, attack: 20, attackDistance: 1, maxHp: 50, defense: 10, price: 4, priceWood: 0, priceOre: 0, shape: 'circle' },
rider: { movement: 4, attack: 20, attackDistance: 1, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'square' },
archer: { movement: 1, attack: 20, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' },
swordsman: { movement: 1, attack: 40, attackDistance: 1, maxHp: 80, defense: 20, price: 10, priceWood: 0, priceOre: 2, shape: 'swordsman' },
shield: { movement: 1, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2, shape: 'square' },
catapult: { movement: 1, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3, shape: 'square' },
knight: { movement: 3, attack: 40, attackDistance: 1, maxHp: 60, defense: 7, price: 14, priceWood: 0, priceOre: 5, shape: 'swordsman' },
```

- [ ] **Step 2: Run unit type tests to verify the core change**

```bash
npm test -- tests/units.test.ts 2>&1
```

Expected: FAIL — the hardcoded assertions in units.test.ts don't match yet.

- [ ] **Step 3: Commit**

```bash
git add src/game/units.ts
git commit -m "rebalance: update UNIT_TYPES to Polytopia-style ratios"
```

---

### Task 2: Update units.test.ts assertions

**Files:**
- Modify: `tests/units.test.ts:26-47`

All the `toEqual` assertions for rider, archer, swordsman, shield, catapult, knight need new expected values.

- [ ] **Step 1: Update line 27 (rider)**

```ts
expect(UNIT_TYPES.rider).toEqual({ movement: 4, attack: 20, attackDistance: 1, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'square' });
```

- [ ] **Step 2: Update line 28 (archer)**

```ts
expect(UNIT_TYPES.archer).toEqual({ movement: 1, attack: 20, attackDistance: 2, maxHp: 40, defense: 7, price: 6, priceWood: 0, priceOre: 0, shape: 'triangle' });
```

- [ ] **Step 3: Update line 29 (swordsman)**

```ts
expect(UNIT_TYPES.swordsman).toEqual({ movement: 1, attack: 40, attackDistance: 1, maxHp: 80, defense: 20, price: 10, priceWood: 0, priceOre: 2, shape: 'swordsman' });
```

- [ ] **Step 4: Update lines 32-33 (shield — description + assertion)**

```ts
it('defines the shield unit with 80 hp, 1 movement and a 8 money + 2 ore price', () => {
    expect(UNIT_TYPES.shield).toEqual({ movement: 1, attack: 7, attackDistance: 1, maxHp: 80, defense: 20, price: 8, priceWood: 0, priceOre: 2, shape: 'square' });
```

- [ ] **Step 5: Update line 37 (catapult)**

```ts
expect(UNIT_TYPES.catapult).toEqual({ movement: 1, attack: 50, attackDistance: 4, maxHp: 30, defense: 0, price: 15, priceWood: 10, priceOre: 3, shape: 'square' });
```

- [ ] **Step 6: Update lines 44-47 (knight — description + assertion + UNIT_ATTACK)**

```ts
it('defines the knight unit with 3 movement, 4 attack and an ore cost', () => {
    expect(UNIT_TYPES.knight).toEqual({ movement: 3, attack: 40, attackDistance: 1, maxHp: 60, defense: 7, price: 14, priceWood: 0, priceOre: 5, shape: 'swordsman' });
    expect(UNIT_ATTACK.knight).toBe(40);
```

- [ ] **Step 7: Update line 104 (makeShield factory)**

```ts
attack: 7,
```

- [ ] **Step 8: Run tests**

```bash
npm test -- tests/units.test.ts 2>&1
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add tests/units.test.ts
git commit -m "rebalance: update unit stat assertions in tests"
```

---

### Task 3: Update combat test factory functions and expected values

**Files:**
- Modify: `tests/combat.test.ts`

The hardcoded factory functions (makeWarrior, makeShield, makeCatapult, makeArcher) and inline unit literals need new values. Expected damage values in comments need updating. Some actual assertions happen to stay the same (warrior vs warrior atk=20/def=10 unchanged).

- [ ] **Step 1: Update line 22 (makeShield factory — attack: 10 → 7)**

```ts
return { id, owner, type: 'shield', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hp, attack: 7, attackDistance: 1, defense: 20, spawnVillage: null };
```

- [ ] **Step 2: Update inline archer literals (defense: 10 → 7, hp: 30 → 40)**
  - Line 149: `hp: 40, attack: 20, attackDistance: 2, defense: 7`
  - Line 210: `hp: 40, attack: 20, attackDistance: 3, defense: 7` (range 3 for this test — keep)
  - Line 351: `hp: 40, attack: 20, attackDistance: 2, defense: 7`
  - Line 366: `hp: 40, attack: 20, attackDistance: 2, defense: 7`

- [ ] **Step 3: Update knight-related comments (atk 50 → 40)**
  - Line 529: change `// damage 50` to `// damage 40`

- [ ] **Step 4: Run combat tests**

```bash
npm test -- tests/combat.test.ts 2>&1
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/combat.test.ts
git commit -m "rebalance: update combat test factories and comments"
```

---

### Task 4: Update AI test factory functions

**Files:**
- Modify: `tests/ai.test.ts`
- Modify: `tests/aiPatterns.test.ts`

These have hardcoded factory functions for rider/archer/shield/knight/swordsman with old stat values. Only defense/attack/HP values that changed need updating; warrior factories are fine.

- [ ] **Step 1: Update ai.test.ts factories**

Line 27 (rider factory): `defense: 10` → `defense: 7`
Line 30-31 (archer factory): `hp = 30` → `hp = 40`, `defense: 10` → `defense: 7`
Line 39 (knight factory): `hp: 50` → `hp: 60`, `attack: 50` → `attack: 40`, `defense: 10` → `defense: 7`

- [ ] **Step 2: Update aiPatterns.test.ts factories**

Line 28-29 (archer factory): `hp = 30` → `hp = 40`, `defense: 10` → `defense: 7`
Line 33 (rider factory): `defense: 10` → `defense: 7`
Line 37 (knight factory): `hp: 50` → `hp: 60`, `attack: 50` → `attack: 40`, `defense: 10` → `defense: 7`

- [ ] **Step 3: Run AI tests**

```bash
npm test -- tests/ai.test.ts tests/aiPatterns.test.ts 2>&1
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/ai.test.ts tests/aiPatterns.test.ts
git commit -m "rebalance: update AI test factories for new stats"
```

---

### Task 5: Update remaining test files (ship, pirates, simulator)

**Files:**
- Modify: `tests/ship.test.ts`
- Modify: `tests/pirates.test.ts`
- Modify: `tests/simulator.test.ts`
- Modify: `tests/simulatorTurn.test.ts`

- [ ] **Step 1: Check ship.test.ts factories**

The `unit()` factory at line 27 uses warrior stats (hp: 50, attack: 20 — unchanged). The swordsman defense check at line 121 and shield defense at line 128 both check defense=20 which is unchanged. No changes needed.

- [ ] **Step 2: Check pirates.test.ts**

The combat comments at lines 194-195 reference warrior stats (attack=20, defense=10) which are unchanged. The combat values at lines 196-197 use warrior vs pirate (pirate unchanged). No changes needed.

- [ ] **Step 3: Check simulator.test.ts**

Line 296: `hp).toBeLessThan(50)` — warrior taking damage, values unchanged.
Line 567: `hp).toBe(30)` — warrior `50-20=30`, values unchanged.
Line 499: comment "knight deals 54 on its 80 hp" — this needs updating since knight attack changes.

Update line 499 comment:
```
// Swordsman survived (knight deals 43 on its 80 hp): no extra attack remains.
```

- [ ] **Step 4: Check simulatorTurn.test.ts**

Line 148: `expect(aiUnit.hp).toBe(17)` — archer attacks AI warrior. Archer attack=20 unchanged, warrior defense=10 unchanged. This value should stay the same.

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/ship.test.ts tests/pirates.test.ts tests/simulator.test.ts tests/simulatorTurn.test.ts 2>&1
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/simulator.test.ts
git commit -m "rebalance: update simulator comment for new knight attack"
```

---

### Task 6: Update GAME.md unit stat table

**Files:**
- Modify: `GAME.md:41-49`

Replace the old stat table with the new values. Note that GAME.md uses display values (divided by 10: attack 20 → 2, HP 50 → 5, defense 10 → 1).

```
| Unit      | Movement | Attack | Attack range | HP | Defense | Spawn cost                 |
|-----------|----------|--------|--------------|----|---------|----------------------------|
| Warrior   | 1        | 2      | 1            | 5  | 1       | 4 money                    |
| Rider     | 4        | 2      | 1            | 4  | 0.7     | 6 money                    |
| Archer    | 1        | 2      | 2            | 4  | 0.7     | 6 money                    |
| Swordsman | 1        | 4      | 1            | 8  | 2       | 10 money + 2 ore           |
| Shield    | 1        | 0.7    | 1            | 8  | 2       | 8 money + 2 ore            |
| Catapult  | 1        | 5      | 4            | 3  | 0       | 15 money + 10 wood + 3 ore |
| Knight    | 3        | 4      | 1            | 6  | 0.7     | 14 money + 5 ore           |
```

- [ ] **Step 1: Update the table in GAME.md**

- [ ] **Step 2: Commit**

```bash
git add GAME.md
git commit -m "rebalance: update GAME.md unit stat table"
```

---

### Task 7: Full test sweep

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1
```

Expected: All tests pass (any failures are pre-existing, unrelated issues).

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1
```

Expected: No errors.

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "rebalance: final fixes after full test sweep"
```