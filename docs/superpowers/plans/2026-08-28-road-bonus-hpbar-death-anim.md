# Road Bonus, HP Bar Action Indicator, Death Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a +1 movement bonus for units starting on their own road, replace the HP-bar red "can act" dot with a dimmed HP text background for the local player's spent units, and add a white-circle unit death animation.

**Architecture:** Extend `moveRange(unit, tile?)` as the single source of movement range and make `reachableTargets` compute the road-aware default range so the AI benefits automatically; all callers that already hold map context pass the unit's tile. The HP-bar change is isolated in `MapView.addHpBar`. The death animation is a ticker-driven one-shot effect spawned from `presentAttack`, mirroring `spawnFloatText`.

**Tech Stack:** TypeScript, PixiJS 8, Vitest.

## Global Constraints

- Own road only: `tile.roadOwner === unit.owner`.
- Road bonus applies to land units only (ships and pirates are unaffected because `roadOwner` is never set on water tiles and pirates have owner `-1`).
- HP text background dimming (`black`, `alpha 0.3`) applies only to units with `unit.owner === localPlayerIndex` that have no actions.
- Death animation: 10 white circles, radius 3–18px, initial opacity 0.1–0.4, rise +200px with a horizontal sine swing, fully transparent at the top, ~1000ms.
- Run `npm test` and `npm run typecheck` after each task; output must be clean.

---

### Task 1: Road movement bonus

**Files:**
- Modify: `src/game/units.ts` (`moveRange`)
- Modify: `src/game/selection.ts` (`reachableTargets` default range)
- Modify: `src/game/unitActions.ts` (`unitCanAct`)
- Modify: `src/game/simulator.ts` (two `reachableTargets` calls in `doMove` and the turn-end validation)
- Modify: `src/controller/gameController.ts` (reachable-keys computation in `render`)
- Test: `tests/units.test.ts`, `tests/selection.test.ts`, `tests/simulator.test.ts`

**Interfaces:**
- Consumes: `Unit`, `UNIT_MOVEMENT` from `units.ts`; `tileAt(map, q, r)` from `selection.ts`; existing `Simulator`/`gameController` structure.
- Produces: `moveRange(unit: Unit, tile?: MapTile): number` — base range, plus `+1` when `tile?.roadOwner === unit.owner`.
- `reachableTargets(map, unit, range?: number, ...)` now treats `range === undefined` as `moveRange(unit, tileAt(map, unit.q, unit.r))` instead of `UNIT_MOVEMENT[unit.type]`.

- [ ] **Step 1: Write failing tests**

Add to `tests/units.test.ts` (imports needed: `MapTile` from `../src/game/mapGen`, `TileType` from `../src/game/tileTypes`):

```ts
function roadTile(owner: number | null): MapTile {
  return {
    q: 0, r: 0, terrain: TileType.GrasslandLand, height: 0.1,
    settlement: null, building: null, roadOwner: owner,
    unit: null, ownedBy: owner, claimedByVillage: null, exploredBy: [],
  };
}

it('moveRange adds +1 on the unit own road tile only', () => {
  expect(moveRange(makeUnit(), roadTile(null))).toBe(1);
  expect(moveRange(makeUnit(), roadTile(1))).toBe(1);
  expect(moveRange(makeUnit(), roadTile(0))).toBe(2);
  expect(moveRange(makeUnit({ type: 'rider' }), roadTile(0))).toBe(4);
  expect(moveRange(makeUnit({ type: 'rider', hasAttacked: true }), roadTile(0))).toBe(2);
  expect(moveRange(makeUnit())).toBe(1);
});
```

Add to `tests/selection.test.ts` (imports already present: `GameMap`, `makeTile`, `reachableTargets`, `tileAt`, `TileType`, `Unit`):

```ts
it('reaches one hex further when the unit starts on its own road', () => {
  const unit: Unit = {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
  };
  const start = makeTile(0, 0, TileType.GrasslandLand);
  start.unit = unit;
  start.roadOwner = 0;
  const map: GameMap = { radius: 4, tiles: [start], spawns: [] };
  map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
  map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
  expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).toContain('2,0');
});

it('gives no road bonus on an enemy road', () => {
  const unit: Unit = {
    id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
    hasMoved: false, hasAttacked: false, hasHealed: false,
    hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
  };
  const start = makeTile(0, 0, TileType.GrasslandLand);
  start.unit = unit;
  start.roadOwner = 1;
  const map: GameMap = { radius: 4, tiles: [start], spawns: [] };
  map.tiles.push(makeTile(1, 0, TileType.GrasslandLand));
  map.tiles.push(makeTile(2, 0, TileType.GrasslandLand));
  expect(reachableTargets(map, unit).map((t) => `${t.q},${t.r}`)).not.toContain('2,0');
});
```

Add to `tests/simulator.test.ts`:

```ts
it('allows a +1 move from the unit own road tile', () => {
  const map = makeTestMap();
  tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
  tileAt(map, 0, 0)!.roadOwner = 0;
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(true);
});

it('rejects the +1 move when the unit does not start on its own road', () => {
  const map = makeTestMap();
  tileAt(map, 0, 0)!.unit = makeUnit('u1', 0, 'warrior', 0, 0);
  tileAt(map, 0, 0)!.roadOwner = 1;
  const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
  const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
  sim.startGame();
  sim.drainEvents();
  expect(sim.applyCommand({ type: 'move', unitId: 'u1', q: 0, r: 2 })).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/units.test.ts tests/selection.test.ts tests/simulator.test.ts`
Expected: FAIL — `moveRange` still returns base range (no tile param), so the own-road assertions fail (`toBe(2)` receives `1`) and the simulator own-road move is rejected.

- [ ] **Step 3: Implement `moveRange(unit, tile?)`**

In `src/game/units.ts`, add a type-only import and change `moveRange`:

```ts
import type { MapTile } from './mapGen';

export function moveRange(unit: Unit, tile?: MapTile): number {
  const base = unit.shipLevel !== undefined
    ? shipMovement(unit)
    : unit.hasAttacked && unit.type === 'rider'
      ? 1
      : UNIT_MOVEMENT[unit.type];
  return tile?.roadOwner === unit.owner ? base + 1 : base;
}
```

- [ ] **Step 4: Make `reachableTargets` compute the road-aware default**

In `src/game/selection.ts`, change the import line `import { Unit, UNIT_MOVEMENT } from './units';` to `import { Unit, moveRange } from './units';` and change the signature + first line of `reachableTargets`:

```ts
export function reachableTargets(
  map: GameMap,
  unit: Unit,
  range?: number,
  canClimb = false,
  canDock = false,
  playerIndex = 0,
): MapTile[] {
  const effectiveRange = range ?? moveRange(unit, tileAt(map, unit.q, unit.r));
```

Then replace the two uses of `range` inside the body with `effectiveRange` (the `hexDistance(from, t) > range` filter and the `path.length <= range` check).

- [ ] **Step 5: Update the explicit callers to pass the unit tile**

`src/game/unitActions.ts`:

```ts
canMove(unit) && reachableTargets(map, unit, moveRange(unit, tile), canClimb, canDock, player.index).length > 0;
```

`src/game/simulator.ts` (both occurrences of `reachableTargets(this.map, unit, moveRange(unit), ...)`):

```ts
const reachable = reachableTargets(this.map, unit, moveRange(unit, tileAt(this.map, unit.q, unit.r)), canClimb, canDock, unit.owner);
```

`src/controller/gameController.ts` (~line 1402):

```ts
this.reachableKeys = new Set(reachableTargets(this.sim.map, unit, moveRange(unit, tileAt(this.sim.map, unit.q, unit.r)), canClimb, canDock, store.localPlayerIndex).map((t) => axialKey(t)));
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/units.test.ts tests/selection.test.ts tests/simulator.test.ts`
Expected: PASS. Then `npm run typecheck` — clean. Then `npx vitest run tests/ai.test.ts tests/aiPatterns.test.ts` (AI uses the new default range) — PASS.

- [ ] **Step 7: Commit**

```bash
git add src/game/units.ts src/game/selection.ts src/game/unitActions.ts src/game/simulator.ts src/controller/gameController.ts tests/units.test.ts tests/selection.test.ts tests/simulator.test.ts
git commit -m "feat: +1 move for units starting on their own road"
```

---

### Task 2: HP bar action indicator (remove red dot, dim text bg)

**Files:**
- Modify: `src/render/mapRenderer.ts` (`addHpBar`)
- Test: `tests/mapRenderer.test.ts`

**Interfaces:**
- Consumes: `canAct` already computed in `update()` and passed to `addHpBar(unit, position, canAct, color, localPlayerIndex)`.
- Produces: no red dot child; `labelBg` fill alpha `0.3` when `unit.owner === localPlayerIndex && !canAct`, else `1`.

- [ ] **Step 1: Write failing tests**

Add to `tests/mapRenderer.test.ts` (imports already present: `Graphics`, `Text`):

```ts
it('dims the hp label background for an own unit with no actions', () => {
  const tile = map.tiles.find((t) => t.q === 0 && t.r === 0)!;
  tile.unit = { ...tile.unit!, hasMoved: true, hasAttacked: true, hasHealed: true };
  view.update(map, players, null, new Set(), new Set(), 0, new Set(), {
    x: 400,
    y: 300,
    scale: 1,
    width: 800,
    height: 600,
  });
  const el = hpBarItem().el;
  const labelIndex = el.children.findIndex((c) => c instanceof Text);
  const labelBg = el.children[labelIndex - 1] as Graphics;
  const context = labelBg.context as unknown as {
    instructions: Array<{ action: string; data: { style: { color: number; alpha: number } } }>;
  };
  const fill = context.instructions.find((i) => i.action === 'fill')!.data.style;
  expect(fill.color).toBe(0x000000);
  expect(fill.alpha).toBe(0.3);
});

it('does not draw the red can-act dot on an own unit hp bar', () => {
  const el = hpBarItem().el;
  const graphicsCount = el.children.filter((c) => c instanceof Graphics).length;
  expect(graphicsCount).toBe(3);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/mapRenderer.test.ts`
Expected: FAIL — `fill.alpha` is `1` (not `0.3`), and `graphicsCount` is `4` (dot present).

- [ ] **Step 3: Implement the change**

In `src/render/mapRenderer.ts`, replace the `labelBg` fill and delete the red-dot block in `addHpBar`:

```ts
    const labelBg = this.takeGraphics();
    labelBg.zIndex = 0;
    const dim = unit.owner === localPlayerIndex && !canAct;
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: 0x000000, alpha: dim ? 0.3 : 1 });
    el.addChild(labelBg);
    el.addChild(label);
```

Remove the trailing block:

```ts
    if (canAct && unit.owner === localPlayerIndex) {
      const dot = this.takeGraphics();
      dot.zIndex = 1;
      dot.circle(barWidth / 2 + 9, -4 + up, 4).fill(0xff0000);
      el.addChild(dot);
    }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/mapRenderer.test.ts`
Expected: PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts tests/mapRenderer.test.ts
git commit -m "feat: replace hp bar red can-act dot with dimmed label bg for spent own units"
```

---

### Task 3: Unit death animation

**Files:**
- Modify: `src/controller/gameController.ts` (add `spawnDeath`, hook into `presentAttack`)
- Test: `tests/moveAnimation.test.ts`

**Interfaces:**
- Consumes: `presentAttack` event fields `attackerTile`, `targetTile`, `attackerDied`, `targetDied`; `tileAt`, `hexToPixel`, `tileElevation`, `this.pan/zoom/baseScale/mapRoot/app.ticker`.
- Produces: `private spawnDeath(tile: MapTile): void` — adds a `Container` with 10 white circle `Graphics` to `mapRoot`, animates on `app.ticker`, removes/destroys on completion.

- [ ] **Step 1: Write failing tests**

Add to `tests/moveAnimation.test.ts` (imports already present: `Application`, `Container`, `Graphics`, `GameEvent`, `makeOpenMap`, `unitAt`, `makeEnemy`, `player`, `setupGame`):

```ts
it('spawns a 10-circle death animation on the dead unit hex and removes it after the rise', async () => {
  const map = makeOpenMap();
  const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
  h = setupGame(map, players);
  const mapRoot = new Container();
  (h.gc as unknown as { mapRoot: Container | null }).mapRoot = mapRoot;

  const target = unitAt(map, 1, 0);
  target.unit = makeEnemy('def', 1, 1, 0);
  h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
    x: 0, y: 0, scale: 1, width: 800, height: 600,
  });

  const callbacks: Array<() => void> = [];
  const app = {
    screen: { width: 800, height: 600 },
    ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
  } as unknown as Application;
  h.gc.app = app;
  let now = 0;
  (globalThis as { performance: Performance }).performance.now = () => now;

  const events: GameEvent[] = [
    {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 0, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: true,
    },
  ];
  const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
  await p;

  expect(mapRoot.children.length).toBe(1);
  const deathEl = mapRoot.children[0] as Container;
  const circles = deathEl.children.filter((c) => c instanceof Graphics);
  expect(circles.length).toBe(10);

  const deathFn = callbacks[callbacks.length - 1];
  now = 2000;
  deathFn();
  expect(mapRoot.children.length).toBe(0);
});

it('does not spawn a death animation on an unexplored death tile', async () => {
  const map = makeOpenMap();
  const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
  h = setupGame(map, players);
  const mapRoot = new Container();
  (h.gc as unknown as { mapRoot: Container | null }).mapRoot = mapRoot;

  const target = unitAt(map, 1, 0);
  target.unit = makeEnemy('def', 1, 1, 0);
  target.exploredBy = [];

  const app = {
    screen: { width: 800, height: 600 },
    ticker: { add: (): void => {}, remove: (): void => {} },
  } as unknown as Application;
  h.gc.app = app;

  const events: GameEvent[] = [
    {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 0, targetDamage: 0, missed: false,
      attackerDied: false, targetDied: true,
    },
  ];
  const p = h.gc.presentEvents(events, h.gc.exploredKeysFor(0));
  await p;

  expect(mapRoot.children.length).toBe(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/moveAnimation.test.ts`
Expected: FAIL — `mapRoot.children.length` is `0` (no death container yet).

- [ ] **Step 3: Implement `spawnDeath`**

In `src/controller/gameController.ts`, add constants near the other animation constants:

```ts
const DEATH_PARTICLE_COUNT = 10;
const DEATH_RISE = 200;
const DEATH_MS = 1000;
```

Add the method next to `spawnFloatText`:

```ts
private spawnDeath(tile: MapTile): void {
  if (!this.app) return;
  const scale = this.baseScale * this.zoom;
  const world = hexToPixel(tile, HEX_SIZE);
  const el = new Container();
  el.zIndex = 10;
  const particles: { g: Graphics; x0: number; swing: number; phase: number; opacity: number }[] = [];
  for (let i = 0; i < DEATH_PARTICLE_COUNT; i++) {
    const g = new Graphics();
    const radius = 3 + Math.random() * 15;
    const opacity = 0.1 + Math.random() * 0.3;
    g.circle(0, 0, radius).fill({ color: 0xffffff, alpha: opacity });
    el.addChild(g);
    particles.push({
      g,
      x0: (Math.random() - 0.5) * 24,
      swing: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      opacity,
    });
  }
  el.position.set(
    this.pan.x + world.x * scale,
    this.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
  );
  this.mapRoot!.addChild(el);

  const tickStart = performance.now();
  const ticker = this.app.ticker;
  const fn = (): void => {
    const t = Math.min(1, (performance.now() - tickStart) / DEATH_MS);
    for (const p of particles) {
      p.g.position.set(p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing, -DEATH_RISE * t);
      p.g.alpha = p.opacity * (1 - t);
    }
    if (t >= 1) {
      ticker.remove(fn);
      this.mapRoot?.removeChild(el);
      el.destroy();
    }
  };
  ticker.add(fn);
}
```

- [ ] **Step 4: Hook into `presentAttack`**

In `presentAttack`, after the `if (e.missed) { ... } else { ... }` block, add:

```ts
if (e.targetDied && targetTile && targetVisible) this.spawnDeath(targetTile);
if (e.attackerDied && attackerTile && attackerVisible) this.spawnDeath(attackerTile);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/moveAnimation.test.ts`
Expected: PASS. Then `npm run typecheck` — clean. Then `npm test` (full suite) — PASS.

- [ ] **Step 6: Commit**

```bash
git add src/controller/gameController.ts tests/moveAnimation.test.ts
git commit -m "feat: white-circle death animation for units killed in combat"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full test suite and typecheck**

Run: `npm test` and `npm run typecheck`
Expected: all tests pass, typecheck clean.

- [ ] **Step 2: Confirm spec coverage**

- Road bonus (own road only, land units only): Task 1.
- HP bar red dot removed + dim bg (own units without actions): Task 2.
- Death animation (10 white circles, rise +200px, fade out): Task 3.
