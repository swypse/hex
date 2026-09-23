# Pirate Cannonball Attacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let pure pirates (no `shipLevel`) fight like ships: pirate attacks and pirate counter-attacks fire a cannonball, and counter shots launch only after the attacker's shot has landed.

**Architecture:** All changes live in `src/controller/eventPresenter.ts`. The attacker side (`presentAttack`) gains a pure-pirate cannonball branch and captures the attacker's shot as an await-able promise instead of fire-and-forget; the counter side (`presentStagedAttack`) gains a pure-pirate cannonball branch and awaits the attacker shot before firing back. The three fire-and-forget wrappers become unused and are deleted.

**Tech Stack:** TypeScript, PixiJS 8, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- Follow existing code style: no comments unless self-evident, 2-space indent, `noUncheckedIndexedAccess` (index access needs `!`).
- Projectile helpers already available (do not recreate): `spawnArrowFromTo(from, to): Promise<void>`, `spawnCannonballFromTo(from, to, catapult: boolean): Promise<void>` — see `eventPresenter.ts:1020-1033`.
- Pirate test units must be **pure** pirates: `makeUnit(...)`, then set `.type = 'pirate'`, and DO NOT set `.shipLevel`.
- Cannonball sprites are identified in tests by `c instanceof Sprite && c.texture.width === 35` (the test cannonball texture is 35×15).
- Commit after each task with conventional messages (`feat:`, etc.).

---

### Task 1: Pure pirate attacker fires a cannonball

**Files:**
- Modify: `src/controller/eventPresenter.ts` (attacker-side branch ~lines 360-368)
- Test: `tests/combatAnimation.test.ts`

**Interfaces:**
- Consumes: existing `e.attackerPre` (type `AttackUnitPre`), `attackerVisible`, `attackerTile`, `targetTile`.
- Produces: no new API. Pure pirates (`e.attackerPre?.type === 'pirate'`) now take the cannonball branch on attack.

- [ ] **Step 1: Write the failing test**

In `tests/combatAnimation.test.ts`, in the `describe('combat animation ordering', ...)` block (or any sibling in that file), after the existing `shoots a cannonball from a pirate ship attack` test (~line 846), add:

```ts
  it('shoots a cannonball from a pure pirate attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const pirate = makeUnit('att', -1, 0, 0, 30);
    pirate.type = 'pirate';
    unitAt(map, 0, 0).unit = pirate;
    unitAt(map, 1, 0).unit = makeUnit('def', 0, 1, 0, 20);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: -1, targetIndex: 0,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 6, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'pirate', owner: -1, hp: 30 },
      targetPre: { type: 'warrior', owner: 0, hp: 20 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 40 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: the new test FAILS at `launched` (no cannonball appears for a pure pirate).

- [ ] **Step 3: Implement**

In `src/controller/eventPresenter.ts`, change the ship cannonball branch (~lines 360-368) from:

```ts
    // Ships fire a cannonball projectile along the same trajectory.
    if (
      e.attackerPre?.shipLevel !== undefined &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCannonball(attackerTile, targetTile);
    }
```

to:

```ts
    // Ships and pirates fire a cannonball projectile along the same trajectory.
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCannonball(attackerTile, targetTile);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: new test PASSES; existing tests (incl. captured-pirate-ship tests) still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/eventPresenter.ts tests/combatAnimation.test.ts
git commit -m "feat: pure pirate attacks fire a cannonball"
```

---

### Task 2: Surviving pure pirate counter-fires a cannonball

**Files:**
- Modify: `src/controller/eventPresenter.ts` (counter branch ~lines 542-548)
- Test: `tests/combatAnimation.test.ts`

**Interfaces:**
- Consumes: `e.targetPre` (type `AttackUnitPre`).
- Produces: no new API. A pure-pirate target that survives and deals counter damage now fires a cannonball back instead of melee-lunging.

- [ ] **Step 1: Write the failing test**

In `tests/combatAnimation.test.ts`, in the `describe('combat animation ordering', ...)` block, after the existing `fires a cannonball back from a pirate ship counter-attack` test (~line 892), add:

```ts
  it('fires a cannonball back from a pure pirate during its counter-attack', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attacker = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 0, 0).unit = attacker;
    const pirate = makeUnit('def', -1, 1, 0, 30);
    pirate.type = 'pirate';
    unitAt(map, 1, 0).unit = pirate;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: -1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'pirate', owner: -1, hp: 30 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const findCannonball = (): Sprite =>
      h.mapRoot.children.find((c) => c instanceof Sprite && (c as Sprite).texture.width === 35) as Sprite;

    let launched = false;
    for (let i = 0; i < 60 && !launched; i++) {
      h.advanceTicks(50);
      await new Promise((r) => setTimeout(r, 5));
      launched = findCannonball() !== undefined;
    }
    expect(launched).toBe(true);

    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 100 && !settled; i++) {
      h.advanceTicks(100);
      await new Promise((r) => setTimeout(r, 5));
    }
    await pEnd;
    expect(findCannonball()).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: the new test FAILS at `launched` (pure pirate counter still lunges).

- [ ] **Step 3: Implement**

In `src/controller/eventPresenter.ts`, change the counter branch in `presentStagedAttack` (~lines 542-548) from:

```ts
      if (targetPre.type === 'archer' && targetPre.shipLevel === undefined) {
        await this.spawnArrowFromTo(targetTile, attackerTile);
      } else if (targetPre.shipLevel !== undefined || targetPre.type === 'catapult') {
        await this.spawnCannonballFromTo(targetTile, attackerTile, targetPre.type === 'catapult');
      } else {
```

to:

```ts
      if (targetPre.type === 'archer' && targetPre.shipLevel === undefined) {
        await this.spawnArrowFromTo(targetTile, attackerTile);
      } else if (targetPre.shipLevel !== undefined || targetPre.type === 'catapult' || targetPre.type === 'pirate') {
        await this.spawnCannonballFromTo(targetTile, attackerTile, targetPre.type === 'catapult');
      } else {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: new test PASSES; all existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controller/eventPresenter.ts tests/combatAnimation.test.ts
git commit -m "feat: surviving pure pirates counter-fire a cannonball"
```

---

### Task 3: Sequence counter shots after the attack shot lands

**Files:**
- Modify: `src/controller/eventPresenter.ts` (attacker-shot calls ~lines 352-377; `presentStagedAttack` signature + body ~lines 499-573; delete wrappers ~lines 1005-1018)
- Test: `tests/combatAnimation.test.ts`

**Interfaces:**
- Consumes: `spawnArrowFromTo`, `spawnCannonballFromTo` (already exist).
- Produces: `presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing, impact?, keep?, attackerShot?)` gains a new trailing param `attackerShot: Promise<void> | null = null`. `presentAttack` passes the captured attacker shot.

- [ ] **Step 1: Write the failing test**

In `tests/combatAnimation.test.ts`, in the `describe('combat animation ordering', ...)` block, add this test (pure pirate vs pure pirate, two tiles apart so the attacker flight is 300 ms > the 160 ms lunge):

```ts
  it('keeps counter cannonballs sequential after the attack shot lands', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    const attackerPirate = makeUnit('att', -1, 0, 0, 40);
    attackerPirate.type = 'pirate';
    unitAt(map, 0, 0).unit = attackerPirate;
    const targetPirate = makeUnit('def', -1, 2, 0, 40);
    targetPirate.type = 'pirate';
    unitAt(map, 2, 0).unit = targetPirate;
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: -1, targetIndex: -1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 2, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'pirate', owner: -1, hp: 40 },
      targetPre: { type: 'pirate', owner: -1, hp: 40 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    const balls = (): number =>
      h.mapRoot.children.filter((c) => c instanceof Sprite && (c as Sprite).texture.width === 35).length;

    // Never two cannonballs in flight at once: the counter ball must wait for
    // the attacker ball (300 ms flight) to land first.
    let sawBall = false;
    let maxConcurrent = 0;
    let settled = false;
    const pEnd = p.finally(() => { settled = true; });
    for (let i = 0; i < 200 && !settled; i++) {
      h.advanceTicks(20);
      await new Promise((r) => setTimeout(r, 5));
      const n = balls();
      if (n > 0) sawBall = true;
      maxConcurrent = Math.max(maxConcurrent, n);
    }
    await pEnd;
    expect(sawBall).toBe(true);
    expect(maxConcurrent).toBeLessThanOrEqual(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: the new test FAILS at `maxConcurrent` — today both balls overlap (attacker fire-and-forget + counter launched right after the 160 ms lunge).

- [ ] **Step 3: Capture the attacker shot in `presentAttack`**

In `src/controller/eventPresenter.ts`, replace the three fire-and-forget branches (~lines 352-377) with versions that capture a single local promise. Change from:

```ts
    // Land archers shoot a visible arrow projectile along an arc to the target.
    if (
      plan.launch === 'arcShot' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnArrow(attackerTile, targetTile);
    }
    // Ships and pirates fire a cannonball projectile along the same trajectory.
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCannonball(attackerTile, targetTile);
    }
    // Catapults lob a cannonball projectile on a higher arc at their ranged target.
    if (
      e.attackerPre?.type === 'catapult' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnCatapultBall(attackerTile, targetTile);
    }
```

to:

```ts
    let attackerShot: Promise<void> | null = null;
    // Land archers shoot a visible arrow projectile along an arc to the target.
    if (
      plan.launch === 'arcShot' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.spawnArrowFromTo(attackerTile, targetTile);
    }
    // Ships and pirates fire a cannonball projectile along the same trajectory.
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.spawnCannonballFromTo(attackerTile, targetTile, false);
    }
    // Catapults lob a cannonball projectile on a higher arc at their ranged target.
    if (
      e.attackerPre?.type === 'catapult' &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.spawnCannonballFromTo(attackerTile, targetTile, true);
    }
```

Then pass it to the staged attack. Change the call (~line 397-399) from:

```ts
      try {
        await this.presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing, impact, keep);
      } finally {
```

to:

```ts
      try {
        await this.presentStagedAttack(e, attackerTile, targetTile, targetVisible, attackerAdvanced, facing, impact, keep, attackerShot);
      } finally {
```

- [ ] **Step 4: Await the attacker shot in `presentStagedAttack`**

Change the `presentStagedAttack` signature (~line 499-508) from:

```ts
  private async presentStagedAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    attackerTile: MapTile,
    targetTile: MapTile,
    targetVisible: boolean,
    attackerAdvanced: boolean,
    facing: 'left' | 'right',
    impact?: 'swordHit' | 'hit',
    keep: Map<string, Unit> = new Map(),
  ): Promise<void> {
```

to (add `attackerShot` after `keep`):

```ts
  private async presentStagedAttack(
    e: Extract<GameEvent, { type: 'attack' }>,
    attackerTile: MapTile,
    targetTile: MapTile,
    targetVisible: boolean,
    attackerAdvanced: boolean,
    facing: 'left' | 'right',
    impact?: 'swordHit' | 'hit',
    keep: Map<string, Unit> = new Map(),
    attackerShot: Promise<void> | null = null,
  ): Promise<void> {
```

Then reorder the blow/impact section. Change (~lines 523-532) from:

```ts
    const scale = this.host.camera().scale;
    await mapView.lungeUnit(attackerKey, targetKey, 10 / scale);
    if (impact) sfx.play(impact);

    // Attacker's blow lands on the target first.
    if (e.attackerDamage > 0) {
      this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
      target.hp = Math.max(0, target.hp - e.attackerDamage);
      this.host.render();
    }
```

to:

```ts
    const scale = this.host.camera().scale;
    await mapView.lungeUnit(attackerKey, targetKey, 10 / scale);
    // Wait for the attacker's projectile to land before the hit lands/counter
    // fires, so multi-tile shots and counter shots never overlap.
    if (attackerShot) await attackerShot;
    if (impact) sfx.play(impact);

    // Attacker's blow lands on the target first.
    if (e.attackerDamage > 0) {
      this.spawnHpText(targetTile, `-${e.attackerDamage}`, 0xff4444);
      target.hp = Math.max(0, target.hp - e.attackerDamage);
      this.host.render();
    }
```

- [ ] **Step 5: Delete the unused fire-and-forget wrappers**

In `src/controller/eventPresenter.ts`, delete these three methods (~lines 1005-1018):

```ts
  /** Archer shot: a 5px-tall arrow projectile (fire-and-forget). */
  private spawnArrow(fromTile: MapTile, toTile: MapTile): void {
    this.spawnArrowFromTo(fromTile, toTile).catch(() => {});
  }

  /** Ship shot: a cannonball projectile (fire-and-forget). */
  private spawnCannonball(fromTile: MapTile, toTile: MapTile): void {
    this.spawnCannonballFromTo(fromTile, toTile, false).catch(() => {});
  }

  /** Catapult shot: a cannonball lobbed on a loftier arc (fire-and-forget). */
  private spawnCatapultBall(fromTile: MapTile, toTile: MapTile): void {
    this.spawnCannonballFromTo(fromTile, toTile, true).catch(() => {});
  }
```

- [ ] **Step 6: Run the combat test file**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: all tests PASS, including the previous two tasks' tests and the new sequential test. If the `scales the cannonball flight with distance (2 tiles ~300ms)` or arrow-flight tests fail, the `attackerShot` if-await timing changed for their case — verify the `elapsed` window still holds (flight duration itself is unchanged; only the hp-text/impact/counter now wait for it).

- [ ] **Step 7: Run full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/controller/eventPresenter.ts tests/combatAnimation.test.ts
git commit -m "feat: sequence counter cannonballs after the attack shot lands"
```

---

## Self-Review

**Spec coverage:**
- Pure pirate attacker fires a cannonball (flat ship lob) — Task 1 ✓
- Pure pirate counter fires a cannonball back — Task 2 ✓
- Counter shot launches only after the attacker's shot lands — Task 3 ✓
- Impact/hp-text synced after ball lands — Task 3 Step 4 ✓
- Consistent re-sequencing for ship/catapult counters — Task 3 (same `attackerShot` path) ✓
- Fire-and-forget wrappers deleted — Task 3 Step 5 ✓
- Existing ship/pirate-ship/archer tests stay green — Task verification steps ✓

**Placeholders:** none — every step has real code and commands.

**Type consistency:**
- `attackerShot: Promise<void> | null = null` declared in `presentAttack`, used as the trailing `presentStagedAttack` arg, and awaited as `if (attackerShot) await attackerShot;` in all three tasks' snippets — the name and type are identical everywhere.
- `spawnArrowFromTo(fromTile, toTile)` / `spawnCannonballFromTo(fromTile, toTile, catapult)` calls match the existing method signatures at `eventPresenter.ts:1020-1033`.
- Test helper names reused verbatim: `makeUnit`, `makeOpenMap`, `player`, `setup`, `unitAt`, `h.gc.presentEvents`, `h.gc.exploredKeysFor`, `h.advanceTicks`, `h.mapRoot.children` — all defined in `tests/combatAnimation.test.ts:66-188`.