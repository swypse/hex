# Rider Post-Attack Move Distance 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a rider that has already attacked this turn move again with distance 2 instead of 1.

**Architecture:** Change the single rider-after-attack branch in `moveRange` in `units.ts` from `1` to `2`. All consumers (UI reachable keys, simulator validation, `unitCanAct`, AI) already compute range through `moveRange`/`reachableTargets`, so one change covers them all.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Rider after attacking: move distance 2 (fresh riders keep 3).
- Road bonus still stacks (`+1` on own road).
- Ships and all other units unaffected.
- Run `npm test` and `npm run typecheck` after the change; output must be clean.

---

### Task 1: Rider post-attack move distance 2

**Files:**
- Modify: `src/game/units.ts` (`moveRange`)
- Modify: `tests/units.test.ts`
- Modify: `tests/simulator.test.ts`
- Modify: `GAME.md`

**Interfaces:**
- Consumes: `moveRange(unit: Unit, tile?: MapTile): number` (unchanged signature).
- Produces: rider-after-attack base range `2` in `moveRange`.

- [ ] **Step 1: Write failing tests**

In `tests/units.test.ts`, update the existing rider assertions in `action availability` and the `moveRange road bonus` describe:

```ts
    expect(moveRange(makeUnit({ type: 'rider', hasAttacked: true }))).toBe(2);
```

and

```ts
    expect(moveRange(makeUnit({ type: 'rider', hasAttacked: true }), roadTile(0))).toBe(3);
```

Add to `tests/simulator.test.ts` (uses `makeTestMap`, `tileAt`, `makeUnit`, `Simulator`, `buildPlayers`, `Tribe`, `SeededRandom` — all already imported):

```ts
it('a rider that attacked can move 2 tiles, but not 3', () => {
  const map = makeTestMap(3);
  const rider = makeUnit('u1', 0, 'rider', 0, 0);
  rider.hasAttacked = true;
  tileAt(map, 0, 0)!.unit = rider;
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(true);
  tileAt(map, 0, 2)!.unit = null;
  const second = makeUnit('u2', 0, 'rider', 0, 0);
  second.hasAttacked = true;
  tileAt(map, 0, 0)!.unit = second;
  expect(sim.applyCommand({ type: 'move', unitId: 'u2', q: 0, r: 3 })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/units.test.ts tests/simulator.test.ts`
Expected: FAIL — `moveRange(makeUnit({ type: 'rider', hasAttacked: true }))` returns `1`, not `2`; the road case returns `2`, not `3`; the simulator rejects the 2-tile post-attack move.

- [ ] **Step 3: Implement the change**

In `src/game/units.ts`, in `moveRange`, change the rider-after-attack branch:

```ts
    : unit.hasAttacked && unit.type === 'rider'
      ? 2
      : UNIT_MOVEMENT[unit.type];
```

- [ ] **Step 4: Update GAME.md**

In `GAME.md`, in the "Move" bullet under "Unit actions", extend the sentence with the rider rule:

```
- **Move** — move up to the unit's movement. Mountains block movement until *Climbing* is learned. Water blocks movement
  (except for ships with *Navigation*). A rider that already attacked this turn can still move up to 2 tiles.
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/units.test.ts tests/simulator.test.ts` — PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/game/units.ts tests/units.test.ts tests/simulator.test.ts GAME.md
git commit -m "feat: rider can move again after attack with distance 2"
```

---

### Task 2: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Rider after attack moves distance 2: Task 1.
- Fresh rider still 3, road bonus stacks, other units unchanged: Task 1 (existing tests cover fresh rider 3 and road `+1`).
