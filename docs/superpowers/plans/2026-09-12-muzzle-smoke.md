# Muzzle Smoke for Ship/Pirate Attacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit a brief rising puff of smoke above ships and pirates the moment they attack or counter-attack.

**Architecture:** A new module `src/render/smoke.ts` provides a pure particle-parameter helper (`muzzleParticleParams`) and a ticker-driven spawner (`spawnMuzzleSmoke`) that mirrors `spawnDeath`. `eventPresenter.ts` calls it at the attack-begin and counter-begin points for ship/pirate shooters.

**Tech Stack:** TypeScript, PixiJS 8 (`Graphics.circle`, `app.ticker`, `Container`), Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- Follow existing code style: no comments unless self-evident, 2-space indent, `noUncheckedIndexedAccess` (index access needs `!`).
- Smoke sizes/alpha/colors below are exact ranges (do not tighten).
- The smoke module takes **screen coordinates** (`x`, `y`); callers compute them via the `hexToPixel` + `camera.pan/scale` + `tileElevation` pattern already used in `spawnDeath`.
- Tests use `c instanceof Graphics` and `c instanceof Container` (as in existing tests).
- Commit after each task with conventional messages (`feat:`).

---

### Task 1: `muzzleParticleParams` and `spawnMuzzleSmoke`

**Files:**
- Create: `src/render/smoke.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces:
  - `export const MUZZLE_MS = 600;`
  - `export const MUZZLE_STAGGER = 150;` (max per-particle delay)
  - `export const MUZZLE_COUNT = 10;`
  - `export interface MuzzleParticleParams { color: number; opacity: number; start: number; end: number }`
  - `export function muzzleParticleParams(rng?: () => number): MuzzleParticleParams`
    default `rng = Math.random`. `color` in `0x222222..0xffffff`, `opacity` in `[0.2, 0.5)`, `start` in `[2, 4)`, `end` in `[6, 10)`.
  - `export function spawnMuzzleSmoke(app: Application, mapRoot: Container, x: number, y: number): void`
    Fire-and-forget: adds a `Container` at `zIndex = 10` with `MUZZLE_COUNT` circle `Graphics`, animates on `app.ticker` for up to `MUZZLE_MS + MUZZLE_STAGGER`, then removes and destroys.

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Application, Container, Graphics } from 'pixi.js';
import { muzzleParticleParams, MUZZLE_COUNT, spawnMuzzleSmoke } from '../src/render/smoke';

function seqRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

describe('muzzleParticleParams', () => {
  it('produces params within the allowed ranges', () => {
    for (let i = 0; i < 50; i++) {
      const p = muzzleParticleParams(seqRng(i + 1));
      expect(p.color).toBeGreaterThanOrEqual(0x222222);
      expect(p.color).toBeLessThanOrEqual(0xffffff);
      expect(p.opacity).toBeGreaterThanOrEqual(0.2);
      expect(p.opacity).toBeLessThan(0.5);
      expect(p.start).toBeGreaterThanOrEqual(2);
      expect(p.start).toBeLessThan(4);
      expect(p.end).toBeGreaterThanOrEqual(6);
      expect(p.end).toBeLessThan(10);
    }
  });
});

describe('spawnMuzzleSmoke', () => {
  it('adds a container with 10 circles that fade and are removed after ~750ms', () => {
    const callbacks: Array<() => void> = [];
    const app = {
      screen: { width: 800, height: 600 },
      ticker: { add: (fn: () => void) => callbacks.push(fn), remove: (): void => {} },
    } as unknown as Application;
    const mapRoot = new Container();

    const realNow = (globalThis as { performance: Performance }).performance.now;
    let now = 1000;
    (globalThis as { performance: Performance }).performance.now = () => now;
    try {
      spawnMuzzleSmoke(app, mapRoot, 50, 50);

      expect(mapRoot.children).toHaveLength(1);
      const el = mapRoot.children[0] as Container;
      expect(el.children).toHaveLength(MUZZLE_COUNT);
      expect(el.children.every((c) => c instanceof Graphics)).toBe(true);
      expect(callbacks).toHaveLength(1);

      const circles = el.children as Graphics[];
      const w0 = circles.map((g) => g.getBounds().width);
      now = 1300;
      callbacks[0]!();
      // 300ms in: past max stagger (150) and before the 600ms end, so every
      // particle has a strictly larger radius.
      const w1 = circles.map((g) => g.getBounds().width);
      for (let i = 0; i < circles.length; i++) {
        expect(w1[i]!).toBeGreaterThan(w0[i]!);
      }
      expect(circles.some((g) => g.alpha > 0)).toBe(true);

      now = 1800;
      callbacks[0]!();
      expect(mapRoot.children).toHaveLength(0);
    } finally {
      (globalThis as { performance: Performance }).performance.now = realNow;
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/smoke.test.ts`
Expected: FAIL — `Cannot find module '../src/render/smoke'`.

- [ ] **Step 3: Write the implementation**

Create `src/render/smoke.ts`:

```ts
import { Application, Container, Graphics } from 'pixi.js';

export const MUZZLE_MS = 600;
export const MUZZLE_STAGGER = 150;
export const MUZZLE_COUNT = 10;
const MUZZLE_RISE = 40;

export interface MuzzleParticleParams {
  color: number;
  opacity: number;
  start: number;
  end: number;
}

export function muzzleParticleParams(
  rng: () => number = Math.random,
): MuzzleParticleParams {
  const minColor = 0x222222;
  const span = 0xffffff - minColor;
  return {
    color: minColor + Math.floor(rng() * (span + 1)),
    opacity: 0.2 + rng() * 0.3,
    start: 2 + rng() * 2,
    end: 6 + rng() * 4,
  };
}

interface SmokeParticle {
  g: Graphics;
  color: number;
  x0: number;
  swing: number;
  phase: number;
  opacity: number;
  start: number;
  end: number;
  delay: number;
}

export function spawnMuzzleSmoke(
  app: Application,
  mapRoot: Container,
  x: number,
  y: number,
): void {
  const el = new Container();
  el.zIndex = 10;
  el.position.set(x, y);
  const particles: SmokeParticle[] = [];
  for (let i = 0; i < MUZZLE_COUNT; i++) {
    const params = muzzleParticleParams();
    const g = new Graphics();
    g.circle(0, 0, params.start).fill({ color: params.color, alpha: 1 });
    g.alpha = 0;
    el.addChild(g);
    particles.push({
      g,
      color: params.color,
      x0: (Math.random() - 0.5) * 24,
      swing: 8 + Math.random() * 8,
      phase: Math.random() * Math.PI * 2,
      opacity: params.opacity,
      start: params.start,
      end: params.end,
      delay: Math.random() * MUZZLE_STAGGER,
    });
  }
  mapRoot.addChild(el);

  const tickStart = performance.now();
  const ticker = app.ticker;
  const fn = (): void => {
    const age = performance.now() - tickStart;
    for (const p of particles) {
      const localAge = age - p.delay;
      if (localAge <= 0) continue;
      const t = Math.min(1, localAge / MUZZLE_MS);
      const radius = p.start + (p.end - p.start) * t;
      p.g.clear();
      p.g.circle(0, 0, radius).fill({ color: p.color, alpha: 1 });
      p.g.alpha = p.opacity * (1 - t);
      p.g.position.set(
        p.x0 + Math.sin(t * Math.PI * 2 + p.phase) * p.swing,
        -MUZZLE_RISE * t,
      );
    }
    if (age >= MUZZLE_MS + MUZZLE_STAGGER) {
      ticker.remove(fn);
      mapRoot.removeChild(el);
      el.destroy();
    }
  };
  ticker.add(fn);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/smoke.test.ts src/render/smoke.ts
git commit -m "feat: muzzle smoke particle spawner"
```

---

### Task 2: Trigger smoke at attack and counter-attack

**Files:**
- Modify: `src/controller/eventPresenter.ts`
- Test: `tests/combatAnimation.test.ts`

**Interfaces:**
- Consumes: `spawnMuzzleSmoke` from Task 1.
- Produces: no new public API. Smoke at attack begin (ship/pirate attacker) and counter begin (ship/pirate counter).

- [ ] **Step 1: Add import and helper**

In `src/controller/eventPresenter.ts`, add near the other `../render/` imports:

```ts
import { spawnMuzzleSmoke } from '../render/smoke';
```

Add a private helper near the projectile spawners:

```ts
  private spawnMuzzleSmokeAt(tile: MapTile): void {
    const app = this.host.app();
    const mapRoot = this.host.mapRoot();
    if (!app || !mapRoot) return;
    const camera = this.host.camera();
    const scale = camera.scale;
    const world = hexToPixel(tile, HEX_SIZE);
    spawnMuzzleSmoke(
      app,
      mapRoot,
      camera.pan.x + world.x * scale,
      camera.pan.y + (world.y - tileElevation(tile, HEX_SIZE)) * scale,
    );
  }
```

- [ ] **Step 2: Write the failing tests**

In `tests/combatAnimation.test.ts`, extend the existing `shoots a cannonball from a pure pirate attack` test. After `expect(launched).toBe(true);`, add:

```ts
      const smokeEl = (): Container | undefined =>
        h.mapRoot.children.find(
          (c) => c instanceof Container && c.children.length === 10 && c.children.every((ch) => ch instanceof Graphics),
        ) as Container | undefined;
      expect(smokeEl()).toBeDefined();
```

Add the same `smokeEl` helper + assertion after `expect(launched).toBe(true);` in the existing `fires a cannonball back from a pure pirate during its counter-attack` test.

(`Container` and `Graphics` are already imported at the top of those tests.)

Add a melee-no-smoke test at the end of the same `describe` block:

```ts
  it('produces no smoke for a melee fight', async () => {
    const map = makeOpenMap();
    const players = [player(0, Tribe.Cats), player(1, Tribe.Barbarians)];
    h = setup(map, players);

    unitAt(map, 0, 0).unit = makeUnit('att', 0, 0, 0, 50);
    unitAt(map, 1, 0).unit = makeUnit('def', 1, 1, 0, 50);
    h.mapView.update(map, players, null, new Set(), new Set(), 0, new Set(), {
      x: 0, y: 0, scale: 1, width: 800, height: 600,
    });

    const attack: GameEvent = {
      type: 'attack', attackerId: 'att', targetId: 'def',
      attackerIndex: 0, targetIndex: 1,
      attackerTile: { q: 0, r: 0 }, targetTile: { q: 1, r: 0 },
      attackerDamage: 5, targetDamage: 5, missed: false,
      attackerDied: false, targetDied: false,
      attackerPre: { type: 'warrior', owner: 0, hp: 50 },
      targetPre: { type: 'warrior', owner: 1, hp: 50 },
    };
    const p = h.gc.presentEvents([attack], h.gc.exploredKeysFor(0));
    await waitFor(() => h.mapRoot.children.length > 0);
    const smokeEl = (): Container | undefined =>
      h.mapRoot.children.find(
        (c) => c instanceof Container && c.children.length === 10 && c.children.every((ch) => ch instanceof Graphics),
      ) as Container | undefined;
    expect(smokeEl()).toBeUndefined();
    await p;
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: FAIL at the smoke assertions in the two pirate tests (no smoke yet). The melee test should already pass (no smoke is correct) and must stay green.

- [ ] **Step 4: Implement the triggers**

In `src/controller/eventPresenter.ts`, in `presentAttack`'s cannonball branch, add the smoke call before spawning the shot. Change:

```ts
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      attackerShot = this.spawnCannonballFromTo(attackerTile, targetTile, false);
    }
```

to:

```ts
    if (
      (e.attackerPre?.shipLevel !== undefined || e.attackerPre?.type === 'pirate') &&
      attackerVisible &&
      attackerTile !== undefined &&
      targetTile !== undefined
    ) {
      this.spawnMuzzleSmokeAt(attackerTile);
      attackerShot = this.spawnCannonballFromTo(attackerTile, targetTile, false);
    }
```

In `presentStagedAttack`'s counter branch, change:

```ts
      } else if (targetPre.shipLevel !== undefined || targetPre.type === 'catapult' || targetPre.type === 'pirate') {
        await this.spawnCannonballFromTo(targetTile, attackerTile, targetPre.type === 'catapult');
```

to:

```ts
      } else if (targetPre.shipLevel !== undefined || targetPre.type === 'catapult') {
        this.spawnMuzzleSmokeAt(targetTile);
        await this.spawnCannonballFromTo(targetTile, attackerTile, targetPre.type === 'catapult');
      } else if (targetPre.type === 'pirate') {
        this.spawnMuzzleSmokeAt(targetTile);
        await this.spawnCannonballFromTo(targetTile, attackerTile, false);
```

Catapults must not smoke, so they stay in the ship branch (`shipLevel` OR catapult) with no smoke; pirates (no `shipLevel`) take their own branch and smoke. Ballistics are unchanged: ships pass `targetPre.type === 'catapult'` → `false`; pirates explicitly `false`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/combatAnimation.test.ts`
Expected: PASS (all three new assertions plus all existing).

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller/eventPresenter.ts tests/combatAnimation.test.ts
git commit -m "feat: muzzle smoke on ship and pirate attack/counter"
```

---

## Self-Review

**Spec coverage:**
- Smoke params (count 10, color ranges, alpha 0.2–0.5, start 2–4, end 6–10, 600 ms, rise) — Task 1 ✓
- Ships/pirates only, no catapult/archer — Task 2 (pirate branch separate from catapult) ✓
- Attack moment (presentAttack) — Task 2 ✓
- Counter moment (presentStagedAttack) — Task 2 ✓
- Visible-only rendering — smoke is called under the same `attackerVisible`-gated projectile condition; counter smoke runs inside `presentStagedAttack` which only runs when the attacker is visible ✓
- Fire-and-forget — Task 1 spawner is non-blocking ✓

**Placeholders:** none — real code and commands in every step.

**Type consistency:**
- `muzzleParticleParams(rng?)` returns `{ color, opacity, start, end }` matching `MuzzleParticleParams` interface.
- `spawnMuzzleSmoke(app, mapRoot, x, y)` used identically in Task 1's test/impl and Task 2's `spawnMuzzleSmokeAt`.
- `smokeEl` assertion shape (`Container` with `10` `Graphics` children) matches `spawnMuzzleSmoke`'s output (`MUZZLE_COUNT = 10`).
- `h.mapRoot.children.find(...) as Container | undefined` matches the `noUncheckedIndexedAccess`-safe undefined pattern used across combatAnimation tests.