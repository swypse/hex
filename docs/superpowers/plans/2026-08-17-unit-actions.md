# Unit Actions, Balance, Move Animation, and Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a rule-based unit action system (move→attack, rider attack→move-1, heal +2, collect resources without double income), animated cell-by-cell movement, red-border highlighting, and balance changes (archer range, doubled spawn cost).

**Architecture:** Add `hasAttacked`/`hasHealed`/`hasCollected` flags and pure availability helpers to `units.ts`; teach `combat.ts`/`capture.ts`/`selection.ts` the new rules with unit-tested pure functions; animate moves in the controller with a temporary sprite stepping through a BFS path; replace glow/ghost highlights with red hex borders in the renderer; surface Heal/Collect in the toolbar.

**Tech Stack:** TypeScript, PixiJS v8, React, Vitest.

## Global Constraints

- `HEX_SIZE = 40`, `MAX_ZOOM = 2` stay fixed.
- Action rules: move → attack allowed; attack → move only for riders (range 1); heal/collect are first-action-only and terminal.
- Collect works on any forest (1 wood) / mountain (1 stone) tile, including enemy territory; collected tiles do not pay at round end; `resourceCollected` clears each round.
- Archer `attackDistance = 2`; prices warrior 4, rider 6, archer 6.
- New `Unit` flags `hasAttacked`, `hasHealed`, `hasCollected` are required fields.
- No new npm dependencies; no code comments.
- Typecheck: `npm run typecheck`; tests: `npm run test`.

---

### Task 1: Unit action model and balance

**Files:**
- Modify: `src/game/units.ts`
- Modify: `src/game/mapGen.ts` (starting unit)
- Modify: `src/game/spawn.ts` (spawned unit)
- Test: `tests/units.test.ts`
- Modify test fixtures: `tests/spawn.test.ts`, `tests/ai.test.ts`, `tests/capture.test.ts`, `tests/combat.test.ts`, `tests/selection.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 7, 8, 9):
  - `Unit` gains `hasAttacked: boolean; hasHealed: boolean; hasCollected: boolean;`
  - `export const HEAL_AMOUNT = 2`
  - `canMove(unit: Unit): boolean` — `!hasMoved && !hasHealed && !hasCollected && (type === 'rider' || !hasAttacked)`
  - `moveRange(unit: Unit): number` — `1` if `hasAttacked && type === 'rider'`, else `UNIT_MOVEMENT[type]`
  - `canAttack(unit: Unit): boolean` — `!hasAttacked && !hasHealed && !hasCollected`
  - `canHeal(unit: Unit): boolean` — first action only and `hp < UNIT_TYPES[type].maxHp`
  - `canCollect(unit: Unit): boolean` — first action only
  - `healUnit(unit: Unit): void` — `hp = min(maxHp, hp + 2)`, `hasHealed = true`

- [ ] **Step 1: Update `UNIT_TYPES` balance values**

In `src/game/units.ts`, change the `UNIT_TYPES` values:

```ts
export const UNIT_TYPES: Record<UnitType, UnitTypeInfo> = {
  warrior: { movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 4, shape: 'circle' },
  rider: { movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 6, shape: 'square' },
  archer: { movement: 1, attack: 1, attackDistance: 2, maxHp: 3, price: 6, shape: 'triangle' },
};
```

- [ ] **Step 2: Add the action flags and helpers**

In `src/game/units.ts`, extend the `Unit` interface (add after `hasMoved`):

```ts
  hasMoved: boolean;
  hasAttacked: boolean;
  hasHealed: boolean;
  hasCollected: boolean;
```

Append to `src/game/units.ts`:

```ts
export const HEAL_AMOUNT = 2;

export function canMove(unit: Unit): boolean {
  return (
    !unit.hasMoved &&
    !unit.hasHealed &&
    !unit.hasCollected &&
    (unit.type === 'rider' || !unit.hasAttacked)
  );
}

export function moveRange(unit: Unit): number {
  return unit.hasAttacked && unit.type === 'rider' ? 1 : UNIT_MOVEMENT[unit.type];
}

export function canAttack(unit: Unit): boolean {
  return !unit.hasAttacked && !unit.hasHealed && !unit.hasCollected;
}

export function canHeal(unit: Unit): boolean {
  return (
    !unit.hasMoved &&
    !unit.hasAttacked &&
    !unit.hasHealed &&
    !unit.hasCollected &&
    unit.hp < UNIT_TYPES[unit.type].maxHp
  );
}

export function canCollect(unit: Unit): boolean {
  return !unit.hasMoved && !unit.hasAttacked && !unit.hasHealed && !unit.hasCollected;
}

export function healUnit(unit: Unit): void {
  unit.hp = Math.min(UNIT_TYPES[unit.type].maxHp, unit.hp + HEAL_AMOUNT);
  unit.hasHealed = true;
}
```

- [ ] **Step 3: Add the three flags to every unit creation site**

In `src/game/mapGen.ts`, the starting unit literal (around line 141) gains the flags after `hasMoved: false,`:

```ts
        hasMoved: false,
        hasAttacked: false,
        hasHealed: false,
        hasCollected: false,
```

In `src/game/spawn.ts`, the spawned unit literal (around line 26) gains the same three lines after `hasMoved: false,`.

- [ ] **Step 4: Update every `Unit` literal in the test files**

Every `Unit`-typed object literal that currently contains `hasMoved: ...` must gain `hasAttacked: false, hasHealed: false, hasCollected: false,` right after it. Files and sites:

- `tests/spawn.test.ts` — lines 40, 42, 62, 70, 72.
- `tests/ai.test.ts` — line 20.
- `tests/capture.test.ts` — line 17.
- `tests/combat.test.ts` — lines 17 and 85.
- `tests/selection.test.ts` — the `warrior` and `other` literals (lines 25-48).

Example (`tests/combat.test.ts` line 16-18):

```ts
function makeWarrior(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hasAttacked: false, hasHealed: false, hasCollected: false, hp, attack: 2, attackDistance: 1, spawnVillage: null };
}
```

Verification that no site was missed is Step 7's typecheck.

- [ ] **Step 5: Update the balance assertions and add action tests**

In `tests/units.test.ts`, replace the `UNIT_TYPES` expectations:

```ts
  it('defines warrior, rider, archer', () => {
    expect(UNIT_TYPES.warrior).toEqual({ movement: 1, attack: 2, attackDistance: 1, maxHp: 5, price: 4, shape: 'circle' });
    expect(UNIT_TYPES.rider).toEqual({ movement: 3, attack: 1, attackDistance: 1, maxHp: 4, price: 6, shape: 'square' });
    expect(UNIT_TYPES.archer).toEqual({ movement: 1, attack: 1, attackDistance: 2, maxHp: 3, price: 6, shape: 'triangle' });
  });
```

Update the import to include the new helpers and append the tests:

```ts
import {
  UNIT_TYPES,
  UnitType,
  canAttack,
  canCollect,
  canHeal,
  canMove,
  healUnit,
  moveRange,
  HEAL_AMOUNT,
} from '../src/game/units';

function makeUnit(overrides: Partial<import('../src/game/units').Unit> = {}): import('../src/game/units').Unit {
  return {
    id: 'u',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
    hasAttacked: false,
    hasHealed: false,
    hasCollected: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
    spawnVillage: null,
    ...overrides,
  };
}

describe('action availability', () => {
  it('canMove: fresh unit yes, warrior after attack no, rider after attack yes with range 1', () => {
    expect(canMove(makeUnit())).toBe(true);
    expect(canMove(makeUnit({ hasMoved: true }))).toBe(false);
    expect(canMove(makeUnit({ hasHealed: true }))).toBe(false);
    expect(canMove(makeUnit({ hasCollected: true }))).toBe(false);
    expect(canMove(makeUnit({ hasAttacked: true }))).toBe(false);
    expect(canMove(makeUnit({ type: 'rider', hasAttacked: true }))).toBe(true);
    expect(moveRange(makeUnit({ type: 'rider', hasAttacked: true }))).toBe(1);
    expect(moveRange(makeUnit())).toBe(1);
    expect(moveRange(makeUnit({ type: 'rider' }))).toBe(3);
  });

  it('canAttack: available after moving, blocked after attacking/healing/collecting', () => {
    expect(canAttack(makeUnit())).toBe(true);
    expect(canAttack(makeUnit({ hasMoved: true }))).toBe(true);
    expect(canAttack(makeUnit({ hasAttacked: true }))).toBe(false);
    expect(canAttack(makeUnit({ hasHealed: true }))).toBe(false);
    expect(canAttack(makeUnit({ hasCollected: true }))).toBe(false);
  });

  it('canHeal: only as a first action and when damaged', () => {
    expect(canHeal(makeUnit({ hp: 3 }))).toBe(true);
    expect(canHeal(makeUnit())).toBe(false);
    expect(canHeal(makeUnit({ hp: 3, hasMoved: true }))).toBe(false);
    expect(canHeal(makeUnit({ hp: 3, hasAttacked: true }))).toBe(false);
    expect(canHeal(makeUnit({ hp: 3, hasCollected: true }))).toBe(false);
  });

  it('canCollect: only as a first action', () => {
    expect(canCollect(makeUnit())).toBe(true);
    expect(canCollect(makeUnit({ hasMoved: true }))).toBe(false);
    expect(canCollect(makeUnit({ hasAttacked: true }))).toBe(false);
    expect(canCollect(makeUnit({ hasHealed: true }))).toBe(false);
    expect(canCollect(makeUnit({ hasCollected: true }))).toBe(false);
  });

  it('healUnit adds HEAL_AMOUNT hp capped at maxHp and marks hasHealed', () => {
    const unit = makeUnit({ hp: 4 });
    healUnit(unit);
    expect(unit.hp).toBe(5);
    expect(unit.hasHealed).toBe(true);
    expect(HEAL_AMOUNT).toBe(2);
    const full = makeUnit();
    healUnit(full);
    expect(full.hp).toBe(5);
  });
});
```

- [ ] **Step 6: Run the units tests**

Run: `npx vitest run tests/units.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck (catches any missed fixture site)**

Run: `npm run typecheck`
Expected: no errors. If errors point to a `Unit` literal missing the new fields, add them (Step 4).

- [ ] **Step 8: Run the full suite**

Run: `npm run test`
Expected: all tests pass (other suites use updated fixtures).

- [ ] **Step 9: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts src/game/spawn.ts tests/units.test.ts tests/spawn.test.ts tests/ai.test.ts tests/capture.test.ts tests/combat.test.ts tests/selection.test.ts
git commit -m "feat: add unit action model with heal and balance changes"
```

---

### Task 2: Combat sets `hasAttacked`, no target stun

**Files:**
- Modify: `src/game/combat.ts`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `Unit` flags from Task 1.
- Produces: `performAttack` sets `attacker.hasAttacked = true`; the target's flags are untouched.

- [ ] **Step 1: Update the failing test**

In `tests/combat.test.ts`, replace the `performAttack` "applies damage both ways" test:

```ts
  it('applies damage both ways, marks the attacker, and leaves the target free to act', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const target = map.tiles[1];
    const result = performAttack(map, attacker, target);
    expect(target.unit!.hp).toBe(3);
    expect(attacker.hp).toBe(4);
    expect(attacker.hasAttacked).toBe(true);
    expect(attacker.hasMoved).toBe(false);
    expect(target.unit!.hasMoved).toBe(false);
    expect(target.unit!.hasAttacked).toBe(false);
    expect(result.attackerDamage).toBe(2);
    expect(result.targetDamage).toBe(1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `attacker.hasAttacked` is `undefined`.

- [ ] **Step 3: Update `performAttack`**

In `src/game/combat.ts`, replace lines 36-37:

```ts
  attacker.hasMoved = true;
  targetUnit.hasMoved = true;
```

with:

```ts
  attacker.hasAttacked = true;
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/combat.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: attacks mark the attacker and no longer stun the target"
```

---

### Task 3: Reachable range parameter and BFS path

**Files:**
- Modify: `src/game/selection.ts`
- Test: `tests/selection.test.ts`

**Interfaces:**
- Consumes: `hexNeighbors`, `Axial` from `./hex`; `Unit` flags from Task 1.
- Produces:
  - `reachableTargets(map: GameMap, unit: Unit, range?: number): MapTile[]` — range defaults to `UNIT_MOVEMENT[unit.type]`
  - `pathBetween(map: GameMap, from: Axial, to: Axial): Axial[]` — BFS over non-water, unoccupied tiles; path steps excluding the start; empty array if unreachable.

- [ ] **Step 1: Add failing tests**

In `tests/selection.test.ts`, update the import to add `pathBetween` and append:

```ts
describe('pathBetween', () => {
  it('walks around water cell by cell', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const unit: Unit = {
      id: 'u', owner: 0, type: 'warrior', q: 0, r: 0,
      hasMoved: false, hasAttacked: false, hasHealed: false, hasCollected: false,
      hp: 5, attack: 2, attackDistance: 1, spawnVillage: null,
    };
    map.tiles.push(makeTile(0, 0, TileType.Land, null, unit));
    map.tiles.push(makeTile(1, 0, TileType.Water));
    map.tiles.push(makeTile(2, 0, TileType.Land));
    map.tiles.push(makeTile(0, 1, TileType.Land));
    map.tiles.push(makeTile(1, 1, TileType.Land));
    const path = pathBetween(map, { q: 0, r: 0 }, { q: 2, r: 0 });
    expect(path).toEqual([{ q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 0 }]);
  });

  it('returns an empty array when the target is unreachable', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([]);
  });

  it('returns an empty array when start equals target', () => {
    const map = makeMap();
    expect(pathBetween(map, { q: 0, r: 0 }, { q: 0, r: 0 })).toEqual([]);
  });
});
```

Also add a range test to the existing `reachableTargets` describe:

```ts
  it('respects a custom range', () => {
    const map = makeMap();
    const unit = tileAt(map, 0, 0)!.unit!;
    for (const t of reachableTargets(map, unit, 2)) {
      expect(hexDistance({ q: 0, r: 0 }, t)).toBeLessThanOrEqual(2);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/selection.test.ts`
Expected: FAIL — `pathBetween` is not exported.

- [ ] **Step 3: Implement**

In `src/game/selection.ts`, change the import:

```ts
import { Axial, hexDistance, hexNeighbors } from './hex';
```

Change `reachableTargets` to:

```ts
export function reachableTargets(map: GameMap, unit: Unit, range = UNIT_MOVEMENT[unit.type]): MapTile[] {
  return map.tiles.filter((t) => {
    if (hexDistance({ q: unit.q, r: unit.r }, t) > range) return false;
    if (t.terrain === TileType.Water) return false;
    if (t.unit) return false;
    return true;
  });
}
```

Append `pathBetween`:

```ts
export function pathBetween(map: GameMap, from: Axial, to: Axial): Axial[] {
  if (from.q === to.q && from.r === to.r) return [];
  const key = (a: Axial): string => `${a.q},${a.r}`;
  const queue: Axial[] = [{ ...from }];
  const cameFrom = new Map<string, string>();
  cameFrom.set(key(from), '');
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const n of hexNeighbors(cur)) {
      const nk = key(n);
      if (cameFrom.has(nk)) continue;
      const tile = tileAt(map, n.q, n.r);
      if (!tile) continue;
      if (tile.terrain === TileType.Water) continue;
      if (tile.unit) continue;
      cameFrom.set(nk, key(cur));
      if (n.q === to.q && n.r === to.r) {
        const path: Axial[] = [];
        let c: Axial = n;
        while (c.q !== from.q || c.r !== from.r) {
          path.unshift({ ...c });
          const prev = cameFrom.get(key(c))!;
          const [pq, pr] = prev.split(',').map(Number);
          c = { q: pq, r: pr };
        }
        return path;
      }
      queue.push({ ...n });
    }
  }
  return [];
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/selection.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/selection.ts tests/selection.test.ts
git commit -m "feat: add BFS path finding and reachable range parameter"
```

---

### Task 4: Collect resources (no double income)

**Files:**
- Modify: `src/game/mapGen.ts` (MapTile field)
- Modify: `src/game/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `Unit` flags (Task 1), `TileType`.
- Produces:
  - `MapTile` gains optional `resourceCollected?: boolean`
  - `tileResourceYield(tile: MapTile): { wood: number; stone: number }`
  - `collectTerrainIncome` skips tiles with `resourceCollected`
  - `collectTileResource(map: GameMap, unit: Unit, player: Player): { wood: number; stone: number }` — grants the current tile's yield, sets `tile.resourceCollected = true` and `unit.hasCollected = true`.

- [ ] **Step 1: Add the field and failing tests**

In `src/game/mapGen.ts`, add to the `MapTile` interface (after `claimedByVillage`):

```ts
  resourceCollected?: boolean;
```

In `tests/capture.test.ts`, update the import to add `collectTileResource, tileResourceYield` and append:

```ts
function resourceTile(terrain: TileType, ownedBy: number | null): MapTile {
  return { q: 0, r: 0, terrain, settlement: null, unit: null, ownedBy, claimedByVillage: null };
}

describe('tileResourceYield', () => {
  it('yields wood for forests and stone for mountains', () => {
    expect(tileResourceYield(resourceTile(TileType.ForestLand, 0))).toEqual({ wood: 1, stone: 0 });
    expect(tileResourceYield(resourceTile(TileType.ForestSand, 0))).toEqual({ wood: 1, stone: 0 });
    expect(tileResourceYield(resourceTile(TileType.ForestSnow, 0))).toEqual({ wood: 1, stone: 0 });
    expect(tileResourceYield(resourceTile(TileType.Mountain, 0))).toEqual({ wood: 0, stone: 1 });
    expect(tileResourceYield(resourceTile(TileType.Land, 0))).toEqual({ wood: 0, stone: 0 });
  });
});

describe('collectTileResource', () => {
  function player(): import('../src/game/players').Player {
    return { index: 0, tribe: 'villagers', isHuman: true, name: 'p', resources: { wood: 0, stone: 0, money: 0 }, isActive: true };
  }

  it('grants the tile yield, marks it, and consumes round-end income', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const tile = resourceTile(TileType.ForestLand, 0);
    map.tiles.push(tile);
    const p = player();
    const unit = makeUnit('u', 0, 0, 0);
    expect(collectTileResource(map, unit, p)).toEqual({ wood: 1, stone: 0 });
    expect(p.resources.wood).toBe(1);
    expect(tile.resourceCollected).toBe(true);
    expect(unit.hasCollected).toBe(true);
    expect(collectTerrainIncome(map, 0).wood).toBe(0);
  });

  it('collects from an enemy-owned tile and denies the enemy income', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const tile = resourceTile(TileType.Mountain, 1);
    map.tiles.push(tile);
    const p = player();
    collectTileResource(map, makeUnit('u', 0, 0, 0), p);
    expect(p.resources.stone).toBe(1);
    expect(collectTerrainIncome(map, 1).stone).toBe(0);
  });

  it('does nothing on a tile with no yield', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    map.tiles.push(resourceTile(TileType.Land, 0));
    const p = player();
    const unit = makeUnit('u', 0, 0, 0);
    expect(collectTileResource(map, unit, p)).toEqual({ wood: 0, stone: 0 });
    expect(unit.hasCollected).toBe(false);
  });
});
```

Note: the existing `collectTerrainIncome` describe in `tests/capture.test.ts` should gain one more test:

```ts
  it('skips tiles that were already collected', () => {
    const map: GameMap = { radius: 2, tiles: [], spawns: [] };
    const forest = incomeTile(TileType.ForestLand, 0);
    forest.resourceCollected = true;
    map.tiles.push(forest, incomeTile(TileType.ForestLand, 0));
    expect(collectTerrainIncome(map, 0)).toEqual({ wood: 1, stone: 0 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/capture.test.ts`
Expected: FAIL — `tileResourceYield` / `collectTileResource` not exported; `collectTerrainIncome` does not skip collected tiles.

- [ ] **Step 3: Implement**

In `src/game/capture.ts`, add the import:

```ts
import { Player } from './players';
```

Replace `collectTerrainIncome` and append:

```ts
export function tileResourceYield(tile: MapTile): { wood: number; stone: number } {
  if (
    tile.terrain === TileType.ForestLand ||
    tile.terrain === TileType.ForestSand ||
    tile.terrain === TileType.ForestSnow
  ) {
    return { wood: 1, stone: 0 };
  }
  if (tile.terrain === TileType.Mountain) return { wood: 0, stone: 1 };
  return { wood: 0, stone: 0 };
}

export function collectTerrainIncome(
  map: GameMap,
  playerIndex: number,
): { wood: number; stone: number } {
  let wood = 0;
  let stone = 0;
  for (const t of map.tiles) {
    if (t.ownedBy !== playerIndex) continue;
    if (t.resourceCollected) continue;
    const y = tileResourceYield(t);
    wood += y.wood;
    stone += y.stone;
  }
  return { wood, stone };
}

export function collectTileResource(
  map: GameMap,
  unit: Unit,
  player: Player,
): { wood: number; stone: number } {
  const tile = map.tiles.find((t) => t.q === unit.q && t.r === unit.r);
  if (!tile) return { wood: 0, stone: 0 };
  const gained = tileResourceYield(tile);
  if (gained.wood === 0 && gained.stone === 0) return { wood: 0, stone: 0 };
  tile.resourceCollected = true;
  unit.hasCollected = true;
  player.resources.wood += gained.wood;
  player.resources.stone += gained.stone;
  return gained;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/capture.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/mapGen.ts src/game/capture.ts tests/capture.test.ts
git commit -m "feat: units collect tile resources without double income"
```

---

### Task 5: Hex corners helper

**Files:**
- Modify: `src/game/hex.ts`
- Test: `tests/hex.test.ts`

**Interfaces:**
- Produces: `hexCorners(h: Axial, hexSize: number): { x: number; y: number }[]`

- [ ] **Step 1: Add failing test**

In `tests/hex.test.ts`, update the import to add `hexCorners` and append:

```ts
describe('hexCorners', () => {
  it('returns six corners centered on the tile', () => {
    const corners = hexCorners({ q: 0, r: 0 }, 40);
    expect(corners.length).toBe(6);
    expect(Math.hypot(corners[0].x, corners[0].y)).toBeCloseTo(40);
    expect(corners.reduce((sum, c) => sum + c.x, 0)).toBeCloseTo(0);
    expect(corners.reduce((sum, c) => sum + c.y, 0)).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/hex.test.ts`
Expected: FAIL — `hexCorners` not exported.

- [ ] **Step 3: Implement**

In `src/game/hex.ts`, append:

```ts
export function hexCorners(h: Axial, hexSize: number): { x: number; y: number }[] {
  const p = hexToPixel(h, hexSize);
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    corners.push({ x: p.x + hexSize * Math.cos(angle), y: p.y + hexSize * Math.sin(angle) });
  }
  return corners;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/hex.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/hex.ts tests/hex.test.ts
git commit -m "feat: add hex corners helper"
```

---

### Task 6: Red-border highlighting, remove glows

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/render/textureFactory.ts`

**Interfaces:**
- Consumes: `hexCorners` (Task 5).
- Produces: `renderMap` draws a red 4px hex border on selected/reachable/attackable tiles; glow textures removed from `TextureSet`.

- [ ] **Step 1: Update `textureFactory.ts`**

- Remove `BlurFilter` from the pixi import (line 1): `import { Application, Graphics, Texture } from 'pixi.js';`
- Remove the `GlowTextures` interface (lines 6-10) and the `glowTextures: GlowTextures;` member from `TextureSet`.
- Remove the `makeGlowTexture` function (lines 66-73).
- In `createTextures`, remove the `glowTextures` creation block and the `glowTextures,` entry in the returned object.

- [ ] **Step 2: Update `mapRenderer.ts` — remove glow/ghost rendering**

- Change the hex import to `import { axialKey, hexCorners, hexToPixel } from '../game/hex';`
- Delete the `glowTextureFor` function (lines 12-26).
- In the tile loop, delete the three blocks:
  - the selection `glow` block,
  - the reachable `ghost` block,
  - the attackable `glow` block.

- [ ] **Step 3: Add the red border drawer**

In `src/render/mapRenderer.ts`, add:

```ts
function drawHighlightBorders(
  container: Container,
  map: GameMap,
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  hexSize: number,
): void {
  const highlighted = new Set<string>();
  if (selection) highlighted.add(axialKey(selection));
  for (const k of reachableKeys) highlighted.add(k);
  for (const k of attackableKeys) highlighted.add(k);
  for (const tile of map.tiles) {
    if (!highlighted.has(axialKey(tile))) continue;
    const points: number[] = [];
    for (const c of hexCorners(tile, hexSize)) points.push(c.x, c.y);
    const border = new Graphics();
    border.poly(points).stroke({ width: 4, color: 0xff0000 });
    container.addChild(border);
  }
}
```

Call it in `renderMap` after the tile loop, next to `drawOwnedBorders`:

```ts
  drawHighlightBorders(container, map, selection, reachableKeys, attackableKeys, hexSize);
  drawOwnedBorders(container, map, players, hexSize);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors. If a `glowTextures` reference remains anywhere, remove it.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts src/render/textureFactory.ts
git commit -m "feat: highlight with red hex borders instead of glows"
```

---

### Task 7: Cell-by-cell move animation

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `pathBetween` (Task 3), `hexToPixel` (already imported), `Sprite` from pixi, `Unit`, `MapTile`.
- Produces:
  - `private spriteScale = 1;` field
  - `private tweenSpriteTo(sprite: Sprite, to: { x: number; y: number }, ms: number): Promise<void>`
  - `private async animateUnitMove(unit: Unit, target: MapTile): Promise<void>`
  - `handleMapClick` becomes `async` and uses `animateUnitMove` for moves; the AI `move` action awaits `animateUnitMove`.

- [ ] **Step 1: Update imports and field**

In `src/controller/gameController.ts`, change the pixi import to include `Sprite`:

```ts
import { Application, Container, Sprite, type Ticker } from 'pixi.js';
```

Change the selection import to add `pathBetween`:

```ts
import { cycleSelection, moveUnit, pathBetween, reachableTargets, Selection, tileAt } from '../game/selection';
```

Add a field after `private qualityFactor = 1;`:

```ts
  private spriteScale = 1;
```

- [ ] **Step 2: Set `spriteScale` in `applyFitToScreen`**

In `applyFitToScreen`, after `this.qualityFactor = qualityFactor(fit, window.devicePixelRatio);`, add:

```ts
    this.spriteScale = 1 / this.qualityFactor;
```

- [ ] **Step 3: Add the animation methods**

Add after `stopCameraAnimation()`:

```ts
  private tweenSpriteTo(sprite: Sprite, to: { x: number; y: number }, ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const from = { x: sprite.position.x, y: sprite.position.y };
      const start = performance.now();
      const tick = (): void => {
        const t = Math.min(1, (performance.now() - start) / ms);
        sprite.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
        if (t >= 1) {
          resolve();
        } else {
          requestAnimationFrame(tick);
        }
      };
      tick();
    });
  }

  private async animateUnitMove(unit: Unit, target: MapTile): Promise<void> {
    if (!this.map || !this.mapContainer || !this.textures) return;
    const source = tileAt(this.map, unit.q, unit.r)!;
    const path = pathBetween(this.map, source, target);
    if (path.length === 0) {
      moveUnit(this.map, unit, target);
      this.render();
      return;
    }
    source.unit = null;
    useGameStore.getState().setSelection(null);
    this.render();
    const store = useGameStore.getState();
    const texture = this.textures.unitTextures[store.players[unit.owner].tribe][unit.type];
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.scale.set(this.spriteScale);
    const startPos = hexToPixel(source, HEX_SIZE);
    sprite.position.set(startPos.x, startPos.y);
    this.mapContainer.addChild(sprite);
    for (const step of path) {
      const to = hexToPixel(step, HEX_SIZE);
      await this.tweenSpriteTo(sprite, to, 140);
    }
    this.mapContainer.removeChild(sprite);
    sprite.destroy();
    moveUnit(this.map, unit, target);
    this.render();
  }
```

- [ ] **Step 4: Use `animateUnitMove` for human moves**

Make `handleMapClick` async and replace its move branch:

```ts
  async handleMapClick(q: number, r: number): Promise<void> {
```

and

```ts
      if (this.reachableKeys.has(axialKey(tile))) {
        await this.animateUnitMove(unit, tile);
        store.setSelection(null);
        return;
      }
```

- [ ] **Step 5: Use `animateUnitMove` for AI moves**

In `runAiPhase`, the `move` action branch currently:

```ts
        } else if (action.type === 'move') {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit) {
            const target = tileAt(this.map, action.q, action.r)!;
            moveUnit(this.map, unit, target);
          }
```

becomes:

```ts
        } else if (action.type === 'move') {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit) {
            const target = tileAt(this.map, action.q, action.r)!;
            await this.animateUnitMove(unit, target);
          }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: animate unit movement cell by cell"
```

---

### Task 8: Controller action gating, heal/collect, round-end resets

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `canAttack`, `canCollect`, `canHeal`, `canMove`, `healUnit`, `moveRange` (Task 1), `collectTileResource` (Task 4).
- Produces: `healSelectedUnit()`, `collectSelectedUnitResources()`; render gating by `canMove`/`canAttack` with `moveRange`; round-end resets all four unit flags and clears `resourceCollected`.

- [ ] **Step 1: Update imports**

In `src/controller/gameController.ts`, change the units import to:

```ts
import { canAttack, canCollect, canHeal, canMove, healUnit, moveRange, UNIT_TYPE_NAMES, UnitType } from '../game/units';
```

Change the capture import to add `collectTileResource`:

```ts
import { captureVillage, collectTerrainIncome, collectTileResource, setCaptureReady, villageIncome } from '../game/capture';
```

- [ ] **Step 2: Gate reachable/attackable rendering**

In `render()`, replace:

```ts
      if (unit.owner === 0 && !unit.hasMoved) {
        this.reachableKeys = new Set(reachableTargets(this.map, unit).map((t) => axialKey(t)));
        this.attackableKeys = new Set(attackableTargets(this.map, unit).map((t) => axialKey(t)));
      }
```

with:

```ts
      if (unit.owner === 0 && canMove(unit)) {
        this.reachableKeys = new Set(reachableTargets(this.map, unit, moveRange(unit)).map((t) => axialKey(t)));
      }
      if (unit.owner === 0 && canAttack(unit)) {
        this.attackableKeys = new Set(attackableTargets(this.map, unit).map((t) => axialKey(t)));
      }
```

- [ ] **Step 3: Relax the attack gate in `handleMapClick`**

In `handleMapClick`, replace:

```ts
      if (unit.owner === 0 && !unit.hasMoved && this.attackableKeys.has(axialKey(tile))) {
```

with:

```ts
      if (unit.owner === 0 && this.attackableKeys.has(axialKey(tile))) {
```

- [ ] **Step 4: Add heal/collect handlers**

Add after `spawnSelectedVillage` (or any controller method):

```ts
  healSelectedUnit(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit') return;
    const tile = tileAt(this.map, selection.q, selection.r)!;
    const unit = tile.unit;
    if (!unit || unit.owner !== 0 || !canHeal(unit)) return;
    healUnit(unit);
    store.setSelection(null);
    this.render();
  }

  collectSelectedUnitResources(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'unit') return;
    const tile = tileAt(this.map, selection.q, selection.r)!;
    const unit = tile.unit;
    if (!unit || unit.owner !== 0 || !canCollect(unit)) return;
    const players = store.players;
    const gained = collectTileResource(this.map, unit, players[0]);
    if (gained.wood === 0 && gained.stone === 0) return;
    store.setPlayers([...players]);
    store.setSelection(null);
    this.render();
  }
```

- [ ] **Step 5: Reset the flags and collected marks each round**

In `runAiPhase`, replace:

```ts
    for (const t of this.map.tiles) {
      if (t.unit) t.unit.hasMoved = false;
    }
```

with:

```ts
    for (const t of this.map.tiles) {
      if (t.unit) {
        t.unit.hasMoved = false;
        t.unit.hasAttacked = false;
        t.unit.hasHealed = false;
        t.unit.hasCollected = false;
      }
      t.resourceCollected = false;
    }
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: gate actions by the unit action model and add heal/collect handlers"
```

---

### Task 9: Heal and Collect toolbar buttons

**Files:**
- Modify: `src/screens/hud/ActionToolbar.tsx`

**Interfaces:**
- Consumes: `canCollect`, `canHeal` (Task 1), `tileResourceYield` (Task 4), `gameController.healSelectedUnit()`, `gameController.collectSelectedUnitResources()` (Task 8).
- Produces: for a selected player-0 unit the toolbar shows Heal +2 HP and Collect resources buttons.

- [ ] **Step 1: Rewrite `ActionToolbar`**

Replace the entire contents of `src/screens/hud/ActionToolbar.tsx`:

```tsx
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { villageCapacity, unitsInVillage } from '../../game/village';
import { tileAt } from '../../game/selection';
import { canAfford, UPGRADE_COST } from '../../game/resources';
import { canCollect, canHeal, UNIT_TYPES } from '../../game/units';
import { tileResourceYield } from '../../game/capture';

export function ActionToolbar(): React.ReactElement {
  const selection = useGameStore((s) => s.selection);
  const players = useGameStore((s) => s.players);
  const setSpawnDialogOpen = useGameStore((s) => s.setSpawnDialogOpen);

  if (!selection) return <div id="action-toolbar" />;
  const map = gameController.getMap();
  if (!map) return <div id="action-toolbar" />;
  const tile = tileAt(map, selection.q, selection.r);
  if (!tile) return <div id="action-toolbar" />;

  if (selection.kind === 'unit') {
    const unit = tile.unit;
    if (!unit || unit.owner !== 0) return <div id="action-toolbar" />;
    const gained = tileResourceYield(tile);
    const healDisabled = !canHeal(unit);
    const collectDisabled = !canCollect(unit) || (gained.wood === 0 && gained.stone === 0);
    return (
      <div id="action-toolbar">
        <button disabled={healDisabled} onClick={() => gameController.healSelectedUnit()}>
          Heal +2 HP
        </button>
        <button disabled={collectDisabled} onClick={() => gameController.collectSelectedUnitResources()}>
          Collect resources
        </button>
      </div>
    );
  }

  if (selection.kind !== 'village') return <div id="action-toolbar" />;
  const village = tile;
  if (!village.settlement) return <div id="action-toolbar" />;

  const isOwned = village.settlement.owner === 0;
  const unit = village.unit;
  const isCapturable =
    !isOwned &&
    unit !== null &&
    unit.owner === 0 &&
    village.settlement.captureReady;

  const capacity = isOwned ? villageCapacity(village.settlement.level) : 0;
  const count = isOwned ? unitsInVillage(map, village) : 0;
  const minPrice = isOwned ? Math.min(...Object.values(UNIT_TYPES).map((t) => t.price)) : Infinity;
  const spawnDisabled = !isOwned || !!village.unit || count >= capacity || players[0].resources.money < minPrice;
  const upgradeDisabled = !isOwned || !canAfford(players[0].resources, UPGRADE_COST);

  return (
    <div id="action-toolbar">
      {isCapturable && (
        <button onClick={() => gameController.captureSelectedVillage()}>Capture village!</button>
      )}
      <button disabled={spawnDisabled} onClick={() => setSpawnDialogOpen(true)}>
        Spawn a unit
      </button>
      <button disabled={upgradeDisabled} onClick={() => gameController.upgradeSelectedVillageFromToolbar()}>
        Upgrade village
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/hud/ActionToolbar.tsx
git commit -m "feat: add heal and collect resource buttons for selected units"
```

---

## Final Verification

- [ ] Run `npm run test` — all unit tests pass.
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual (`npm run dev`): heal +2 HP button; move then attack works; attacking then moving only works for riders (1 tile); collect works on any forest/mountain (even enemy's) and the tile does not pay again at round end; units move cell-by-cell; highlights are red hex borders (no glows); archer range is 2; spawn prices are doubled.
