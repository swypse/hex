# Shield Cannot Attack After Moving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a shield unit from attacking in a turn in which it has already moved.

**Architecture:** Add a shield-specific guard to `canAttack` in `units.ts`. All consumers (attack range display, `unitCanAct`, simulator `doAttack`, toolbar) already call `canAttack`, so one change covers the game logic, UI, and AI.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `canAttack(shield)` is false when `shield.hasMoved === true`.
- Other units unchanged; counter-attacks unchanged (range-driven in `performAttack`).
- Run `npm test` and `npm run typecheck` after the change; output must be clean.

---

### Task 1: Shield cannot attack after moving

**Files:**
- Modify: `src/game/units.ts` (`canAttack`)
- Modify: `tests/units.test.ts`
- Modify: `tests/simulator.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: `Unit` type.
- Produces: updated `canAttack(unit: Unit): boolean`.

- [ ] **Step 1: Write failing tests**

In `tests/units.test.ts`, add a `makeShield` helper next to `makeUnit`:

```ts
function makeShield(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 's',
    owner: 0,
    type: 'shield',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hp: 10,
    attack: 1,
    attackDistance: 1,
    spawnVillage: null,
    ...overrides,
  };
}
```

Extend the `canAttack` test:

```ts
  it('canAttack: shield cannot attack after moving, other units can', () => {
    expect(canAttack(makeShield())).toBe(true);
    expect(canAttack(makeShield({ hasMoved: true }))).toBe(false);
    expect(canAttack(makeShield({ hasAttacked: true }))).toBe(false);
    expect(canAttack(makeUnit({ hasMoved: true }))).toBe(true);
  });
```

Add to `tests/simulator.test.ts`:

```ts
it('a shield that moved cannot attack, a shield that did not move can', () => {
  const map = makeTestMap();
  const defender = makeUnit('def', 1, 'warrior', 0, 1);
  tileAt(map, 0, 1)!.unit = defender;
  const shield = makeUnit('sh', 0, 'shield', 0, 0);
  tileAt(map, 0, 0)!.unit = shield;
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  expect(sim.applyCommand({ type: 'attack', unitId: 'sh', q: 0, r: 1 })).toBe(true);
  sim.drainEvents();
  const moved = makeUnit('sh2', 0, 'shield', 0, 0);
  moved.hasMoved = true;
  tileAt(map, 0, 0)!.unit = moved;
  expect(sim.applyCommand({ type: 'attack', unitId: 'sh2', q: 0, r: 1 })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/units.test.ts tests/simulator.test.ts`
Expected: FAIL — `canAttack(makeShield({ hasMoved: true }))` returns `true`, and the simulator accepts the moved shield's attack.

- [ ] **Step 3: Implement**

In `src/game/units.ts`, `canAttack`:

```ts
export function canAttack(unit: Unit): boolean {
  return (
    !unit.hasAttacked &&
    !unit.hasHealed &&
    !unit.hasLanded &&
    !(unit.type === 'shield' && unit.hasMoved)
  );
}
```

- [ ] **Step 4: Update GAME.md**

In `GAME.md`, in the "Attack" bullet under "Unit actions", append the shield rule:

```
  A shield cannot attack in a turn in which it has already moved.
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/units.test.ts tests/simulator.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts tests/units.test.ts tests/simulator.test.ts GAME.md
git commit -m "feat: shield cannot attack after moving"
```

---

### Task 2: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Shield cannot attack after moving: Task 1.
- Other units, counter-attacks unchanged: Task 1 tests.
