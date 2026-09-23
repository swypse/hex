# Battle Mechanics (First Version) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add combat: units get `attack` + `attackDistance`, selected unmoved units can attack enemies in range after a confirm prompt, damage scales with current HP, the defender strikes back, units die at 0 HP. AI prefers attacks over moves and moves greedily toward the nearest enemy.

**Architecture:** Pure combat logic in `src/game/combat.ts` (testable); `units.ts` gains attack fields; the store gains `pendingAttack`; a React `ConfirmDialog` shows the prompt; `gameController` wires click→prompt→combat→popups; `ai.ts` plans `attack` actions and greedy moves; the renderer shows attackable targets with a red glow.

**Tech Stack:** TypeScript, React 18, zustand, PixiJS 8, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `UNIT_ATTACK: Record<UnitType, number> = { warrior: 2 }`; `UNIT_ATTACK_DISTANCE: Record<UnitType, number> = { warrior: 1 }`.
- `Unit` gains `attack: number`, `attackDistance: number`. `hasMoved` is the single acted-this-turn flag (attack sets it too).
- `attackDamage(unit) = Math.round(unit.attack * unit.hp / MAX_HP)` — may be 0.
- `attackableTargets(map, unit)`: enemy unit within `attackDistance`, target terrain !== Water.
- `performAttack` returns `AttackResult { attackerDamage, targetDamage, attackerDied, targetDied }`; both units get `hasMoved = true`; death removes the unit (`tile.unit = null`).
- `AiAction` gains `{ type: 'attack'; unitId: string; q: number; r: number }`.
- Store gains `pendingAttack: { q: number; r: number } | null` + `setPendingAttack`.
- `renderMap` gains `attackableKeys: Set<string>` (red glow on attackable enemies).
- Popups: `"{A} attacks {T}: -{N} hp"` (both directions), `"{Name} dies"`, tribe-color background.
- Tests: `npm test`; typecheck `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Unit attack fields + combat logic

**Files:**
- Modify: `src/game/units.ts`
- Modify: `src/game/mapGen.ts`
- Create: `src/game/combat.ts`
- Modify: `tests/selection.test.ts`, `tests/ai.test.ts`, `tests/mapGen.test.ts` (unit literals gain attack fields)
- Test: `tests/combat.test.ts` (new)

**Interfaces:**
- Consumes: `units.ts` (`Unit`, `MAX_HP`, `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE`), `mapGen.ts` (`GameMap`, `MapTile`), `hex.ts` (`hexDistance`), `tileTypes.ts` (`TileType`), `selection.ts` (`tileAt`).
- Produces (used by Tasks 2-4):
  - `attackDamage(attacker: Unit): number`
  - `attackableTargets(map: GameMap, unit: Unit): MapTile[]`
  - `performAttack(map: GameMap, attacker: Unit, target: MapTile): AttackResult`

- [ ] **Step 1: Write the failing test**

Create `tests/combat.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { attackDamage, attackableTargets, performAttack } from '../src/game/combat';
import { TileType } from '../src/game/tileTypes';
import { Unit, MAX_HP } from '../src/game/units';

function makeTile(
  q: number,
  r: number,
  terrain: TileType,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain, settlement: null, unit, ownedBy: null };
}

function makeWarrior(id: string, owner: number, q: number, r: number, hp: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hp, attack: 2, attackDistance: 1 };
}

function makeMap(): GameMap {
  const a = makeTile(0, 0, TileType.Land, makeWarrior('a', 0, 0, 0, MAX_HP));
  const b = makeTile(1, 0, TileType.Land, makeWarrior('b', 1, 1, 0, MAX_HP));
  const water = makeTile(0, -1, TileType.Water, makeWarrior('c', 1, 0, -1, MAX_HP));
  return { radius: 4, tiles: [a, b, water], spawns: [] };
}

describe('attackDamage', () => {
  it('scales with current hp', () => {
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 5))).toBe(2);
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 3))).toBe(1);
    expect(attackDamage(makeWarrior('x', 0, 0, 0, 1))).toBe(0);
  });
});

describe('attackableTargets', () => {
  it('includes adjacent enemies and excludes friendly units and water', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const targets = attackableTargets(map, attacker);
    const keys = targets.map((t) => `${t.q},${t.r}`);
    expect(keys).toContain('1,0');
    expect(keys).not.toContain('0,-1');
    expect(keys).not.toContain('0,0');
  });
});

describe('performAttack', () => {
  it('applies damage both ways and sets hasMoved', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const target = map.tiles[1];
    const result = performAttack(map, attacker, target);
    expect(target.unit!.hp).toBe(3);
    expect(attacker.hp).toBe(4);
    expect(attacker.hasMoved).toBe(true);
    expect(target.unit!.hasMoved).toBe(true);
    expect(result.attackerDamage).toBe(2);
    expect(result.targetDamage).toBe(1);
  });

  it('kills the target at zero hp and removes it from the tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const dying = makeTile(1, 0, TileType.Land, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1] = dying;
    const result = performAttack(map, attacker, dying);
    expect(dying.unit).toBeNull();
    expect(result.targetDied).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `combat.ts` not found; `Unit` literal missing `attack`/`attackDistance` (typecheck).

- [ ] **Step 3: Update `src/game/units.ts`**

Replace the entire file contents:

```ts
export type UnitType = 'warrior';

export const MAX_HP = 5;

export interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
  hp: number;
  attack: number;
  attackDistance: number;
}

export const UNIT_MOVEMENT: Record<UnitType, number> = {
  warrior: 1,
};

export const UNIT_ATTACK: Record<UnitType, number> = {
  warrior: 2,
};

export const UNIT_ATTACK_DISTANCE: Record<UnitType, number> = {
  warrior: 1,
};

export const UNIT_TYPE_NAMES: Record<UnitType, string> = {
  warrior: 'Warrior',
};
```

- [ ] **Step 4: Update `src/game/mapGen.ts`**

Import `UNIT_ATTACK`, `UNIT_ATTACK_DISTANCE` (add to the existing `./units` import) and set the fields in the unit-placement loop:

```ts
import { MAX_HP, Unit, UNIT_ATTACK, UNIT_ATTACK_DISTANCE } from './units';
```

```ts
        hasMoved: false,
        hp: MAX_HP,
        attack: UNIT_ATTACK.warrior,
        attackDistance: UNIT_ATTACK_DISTANCE.warrior,
      };
```

- [ ] **Step 5: Create `src/game/combat.ts`**

```ts
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { TileType } from './tileTypes';
import { MAX_HP, Unit } from './units';

export interface AttackResult {
  attackerDamage: number;
  targetDamage: number;
  attackerDied: boolean;
  targetDied: boolean;
}

export function attackDamage(attacker: Unit): number {
  return Math.round((attacker.attack * attacker.hp) / MAX_HP);
}

export function attackableTargets(map: GameMap, unit: Unit): MapTile[] {
  return map.tiles.filter((t) => {
    if (!t.unit) return false;
    if (t.unit.owner === unit.owner) return false;
    if (hexDistance({ q: unit.q, r: unit.r }, t) > unit.attackDistance) return false;
    if (t.terrain === TileType.Water) return false;
    return true;
  });
}

export function performAttack(
  map: GameMap,
  attacker: Unit,
  target: MapTile,
): AttackResult {
  const targetUnit = target.unit!;
  const attackerDamage = attackDamage(attacker);
  const targetDied = targetUnit.hp - attackerDamage <= 0;
  targetUnit.hp = Math.max(0, targetUnit.hp - attackerDamage);
  attacker.hasMoved = true;
  targetUnit.hasMoved = true;

  let targetDamage = 0;
  let attackerDied = false;
  if (!targetDied) {
    targetDamage = attackDamage(targetUnit);
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }

  if (targetDied) {
    target.unit = null;
  }
  if (attackerDied) {
    const attackerTile = map.tiles.find((t) => t.unit === attacker);
    if (attackerTile) attackerTile.unit = null;
  }

  return { attackerDamage, targetDamage, attackerDied, targetDied };
}
```

- [ ] **Step 6: Update unit literals in existing tests**

Add `attack: 2, attackDistance: 1` to every `Unit` literal in `tests/selection.test.ts` (two literals: `warrior`, `other`), `tests/ai.test.ts` (`makeWarrior`), and `tests/mapGen.test.ts` (unit-placement assertions reference fields; the test file uses generated units, so only the new assertion is added in the next step).

In `tests/selection.test.ts`, update both literals:

```ts
  const warrior: Unit = {
    id: 'w0',
    owner: 0,
    type: 'warrior',
    q: 0,
    r: 0,
    hasMoved: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
  };
  const other: Unit = {
    id: 'w1',
    owner: 1,
    type: 'warrior',
    q: -1,
    r: 0,
    hasMoved: false,
    hp: 5,
    attack: 2,
    attackDistance: 1,
  };
```

In `tests/ai.test.ts`, update `makeWarrior`:

```ts
function makeWarrior(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: false, hp: 5, attack: 2, attackDistance: 1 };
}
```

In `tests/mapGen.test.ts`, add assertions to the existing unit test:

```ts
      expect(s.unit!.hasMoved).toBe(false);
      expect(s.unit!.hp).toBe(5);
      expect(s.unit!.attack).toBe(2);
      expect(s.unit!.attackDistance).toBe(1);
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test`
Expected: PASS (all tests, including new combat tests).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/game/units.ts src/game/mapGen.ts src/game/combat.ts tests/combat.test.ts tests/selection.test.ts tests/ai.test.ts tests/mapGen.test.ts
git commit -m "feat: add unit attack fields and combat logic"
```

---

### Task 2: Store pendingAttack + ConfirmDialog

**Files:**
- Modify: `src/store/gameStore.ts`
- Create: `src/ui/ConfirmDialog.tsx`
- Modify: `src/screens/GameScreen.tsx` (render the dialog)
- Test: `tests/gameStore.test.ts` (add a test)

**Interfaces:**
- Consumes: `store/gameStore.ts`, `controller/gameController.ts` (added in Task 3; referenced as callbacks).
- Produces:
  - Store: `pendingAttack: { q: number; r: number } | null`, `setPendingAttack(...)`.
  - `ConfirmDialog` component rendered when `pendingAttack !== null`, message `"Attack {EnemyName}?"`, Confirm/Cancel buttons calling `gameController.confirmAttack()` / `gameController.cancelAttack()`.

- [ ] **Step 1: Add the store field and test**

Add to `tests/gameStore.test.ts`:

```ts
  it('setPendingAttack updates pendingAttack', () => {
    useGameStore.getState().setPendingAttack({ q: 3, r: 4 });
    expect(useGameStore.getState().pendingAttack).toEqual({ q: 3, r: 4 });
    useGameStore.getState().setPendingAttack(null);
    expect(useGameStore.getState().pendingAttack).toBeNull();
  });
```

Update `beforeEach` in that test to include `pendingAttack: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `setPendingAttack`/`pendingAttack` missing.

- [ ] **Step 3: Update `src/store/gameStore.ts`**

Add to the `GameStore` interface (after `selection`):

```ts
  pendingAttack: { q: number; r: number } | null;
```

and the action:

```ts
  setPendingAttack: (pendingAttack: { q: number; r: number } | null) => void;
```

Add to the initial state `pendingAttack: null`, and:

```ts
  setPendingAttack: (pendingAttack) => set({ pendingAttack }),
```

- [ ] **Step 4: Create `src/ui/ConfirmDialog.tsx`**

```tsx
import { gameController } from '../controller/gameController';
import { useGameStore } from '../store/gameStore';
import { TRIBES } from '../game/tribes';
import { tileAt } from '../game/selection';
import { UNIT_TYPE_NAMES } from '../game/units';

export function ConfirmDialog(): React.ReactElement {
  const pendingAttack = useGameStore((s) => s.pendingAttack);
  const players = useGameStore((s) => s.players);
  const map = gameController.getMap();

  if (!pendingAttack || !map) return <></>;
  const tile = tileAt(map, pendingAttack.q, pendingAttack.r);
  if (!tile || !tile.unit) return <></>;
  const enemy = tile.unit;
  const owner = players[enemy.owner];
  const tribe = TRIBES.find((t) => t.id === owner.tribe)!;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 20,
      }}
    >
      <div style={{ background: '#000', padding: 16, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>Attack {owner.name}&apos;s {UNIT_TYPE_NAMES[enemy.type]}?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => gameController.confirmAttack()}>Confirm</button>
          <button onClick={() => gameController.cancelAttack()}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
```

Note: `gameController.confirmAttack`/`cancelAttack` are added in Task 3. This component compiles only after Task 3 exists — create it in Task 2 but commit after Task 3, OR create it in Task 3. To keep every task compiling, **create this file in Task 3** instead (Task 2 only adds the store field + test). The plan is adjusted accordingly: Task 2 = store field only.

- [ ] **Step 5: Verify typecheck and tests (store change only)**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/gameStore.ts tests/gameStore.test.ts
git commit -m "feat: add pending attack state to store"
```

---

### Task 3: Controller attack flow + ConfirmDialog

**Files:**
- Modify: `src/controller/gameController.ts`
- Create: `src/ui/ConfirmDialog.tsx`
- Modify: `src/screens/GameScreen.tsx`
- Test: typecheck + tests + manual.

**Interfaces:**
- Consumes: `combat.ts` (`attackableTargets`, `performAttack`), `store` (`pendingAttack`), `units.ts` (`UNIT_TYPE_NAMES`), `selection.ts` (`tileAt`).
- Produces: `confirmAttack()`, `cancelAttack()`, attack handling in `handleMapClick`, attackable-highlight computation.

- [ ] **Step 1: Add combat imports and attack helpers to `gameController.ts`**

Add imports:

```ts
import { attackableTargets, performAttack } from '../game/combat';
```

Add two private fields:

```ts
  private attackableKeys = new Set<string>();
```

Add public methods (after `upgradeSelectedVillage`):

```ts
  confirmAttack(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    const pending = store.pendingAttack;
    const selection = store.selection;
    store.setPendingAttack(null);
    if (!pending || !selection || selection.kind !== 'unit') return;
    const attackerTile = tileAt(this.map, selection.q, selection.r);
    const attacker = attackerTile?.unit;
    const targetTile = tileAt(this.map, pending.q, pending.r);
    if (!attacker || !targetTile || !targetTile.unit) return;
    const players = store.players;
    const attackerPlayer = players[attacker.owner];
    const targetPlayer = players[targetTile.unit.owner];
    const result = performAttack(this.map, attacker, targetTile);
    showPopup(
      `${attackerPlayer.name} attacks ${targetPlayer.name}: -${result.attackerDamage} hp`,
      { background: tribeBackground(attackerPlayer) },
    );
    if (result.targetDied) {
      showPopup(`${targetPlayer.name}'s unit dies`, { background: tribeBackground(targetPlayer) });
    } else {
      showPopup(
        `${targetPlayer.name} attacks ${attackerPlayer.name}: -${result.targetDamage} hp`,
        { background: tribeBackground(targetPlayer) },
      );
      if (result.attackerDied) {
        showPopup(`${attackerPlayer.name}'s unit dies`, { background: tribeBackground(attackerPlayer) });
      }
    }
    store.setSelection(null);
    this.render();
  }

  cancelAttack(): void {
    useGameStore.getState().setPendingAttack(null);
  }
```

- [ ] **Step 2: Update `handleMapClick` for attacks**

Replace the beginning of `handleMapClick` so that clicking an attackable enemy sets `pendingAttack`:

```ts
  handleMapClick(q: number, r: number): void {
    if (!this.map || !this.app) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const tile = tileAt(this.map, q, r);
    if (!tile) return;

    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const unit = tileAt(this.map, selection.q, selection.r)!.unit!;
      if (unit.owner === 0 && !unit.hasMoved && this.attackableKeys.has(axialKey(tile))) {
        store.setPendingAttack({ q, r });
        return;
      }
      if (this.reachableKeys.has(axialKey(tile))) {
        moveUnit(this.map, unit, tile);
        store.setSelection(null);
        this.render();
        return;
      }
    }

    store.setSelection(cycleSelection(selection, tile));
    this.render();
  }
```

- [ ] **Step 3: Compute `attackableKeys` in `render()`**

In `render()`, replace the reachable-keys block with both sets:

```ts
    this.reachableKeys = new Set<string>();
    this.attackableKeys = new Set<string>();
    const selection = store.selection;
    if (selection && selection.kind === 'unit') {
      const tile = tileAt(this.map, selection.q, selection.r)!;
      const unit = tile.unit!;
      if (unit.owner === 0 && !unit.hasMoved) {
        this.reachableKeys = new Set(reachableTargets(this.map, unit).map((t) => axialKey(t)));
        this.attackableKeys = new Set(attackableTargets(this.map, unit).map((t) => axialKey(t)));
      }
    }
```

Update the `renderMap` call to pass `this.attackableKeys`:

```ts
    this.mapContainer = renderMap(this.app, this.map, this.textures, store.players, selection, this.reachableKeys, this.attackableKeys, HEX_SIZE);
```

Note: `renderMap` signature gains `attackableKeys` in Task 4 — the call site is updated here so typecheck passes only after Task 4. To keep this task compiling, add a temporary empty set as a placeholder is not needed if Task 4 changes the signature in the same working tree before typecheck. The plan runs Task 4 next; typecheck is verified green at the end of Task 4.

- [ ] **Step 4: Create `src/ui/ConfirmDialog.tsx`**

Use the component code from Task 2 Step 4 (it references `gameController.confirmAttack`/`cancelAttack` which now exist).

- [ ] **Step 5: Render the dialog in `src/screens/GameScreen.tsx`**

Add the import and element:

```tsx
import { ConfirmDialog } from '../ui/ConfirmDialog';
```

```tsx
      <PopupStack />
      <ConfirmDialog />
```

- [ ] **Step 6: Run typecheck and tests**

Run: `npm run typecheck`
Expected: no errors (after Task 4 updates `renderMap`).

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts src/ui/ConfirmDialog.tsx src/screens/GameScreen.tsx
git commit -m "feat: add attack confirmation flow"
```

---

### Task 4: Renderer attackable highlights

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Test: typecheck + tests + manual screenshot.

**Interfaces:**
- Consumes: `selection.ts` (`tileAt`), `mapGen.ts` (`MapTile`).
- Produces: `renderMap(app, map, textures, players, selection, reachableKeys, attackableKeys, hexSize?)` — attackable enemy tiles get a red glow.

- [ ] **Step 1: Update `src/render/mapRenderer.ts`**

Add the `attackableKeys` parameter and a red glow for attackable tiles. Replace the function signature:

```ts
export function renderMap(
  app: Application,
  map: GameMap,
  textures: TextureSet,
  players: Player[],
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  hexSize = 40,
): Container {
```

Add, after the ghost block inside the tile loop:

```ts
    if (attackableKeys.has(key)) {
      const targetUnit = tile.unit!;
      const ownerTribe = players[targetUnit.owner].tribe;
      const glow = new Sprite(textures.glowTextures.byTribe[ownerTribe]);
      glow.anchor.set(0.5);
      glow.position.set(p.x, p.y);
      glow.tint = 0xff0000;
      container.addChild(glow);
    }
```

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors (the Task 3 call site now matches).

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Manual screenshot verification**

Run the dev server + Chrome, start a game, select the human's unit, and confirm attackable enemy tiles show a red glow. (May need to move units near each other first.) Kill the server afterwards.

- [ ] **Step 4: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: highlight attackable enemies"
```

---

### Task 5: AI attacks + greedy movement

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/controller/gameController.ts`
- Test: `tests/ai.test.ts` (add tests)

**Interfaces:**
- Consumes: `combat.ts` (`attackableTargets`), `selection.ts` (`reachableTargets`), `hex.ts` (`hexDistance`), `units.ts` (`Unit`).
- Produces: `AiAction` gains `{ type: 'attack'; unitId; q; r }`; greedy move targets nearest enemy.

- [ ] **Step 1: Add failing tests to `tests/ai.test.ts`**

```ts
  it('prefers attack over move when an enemy is in range', () => {
    const map = makeAiMap();
    map.tiles.push(makeTile(0, 1, 0, null, makeWarrior('enemy', 0, 0, 1)));
    const actions = planAiActions(map, 1, new SeededRandom(1));
    const attack = actions.find((a) => a.type === 'attack');
    expect(attack).toBeDefined();
    if (attack && attack.type === 'attack') {
      expect(attack.q).toBe(0);
      expect(attack.r).toBe(1);
    }
  });

  it('moves greedily toward the nearest enemy', () => {
    const map = makeAiMap();
    map.tiles.push(makeTile(2, 0, null));
    map.tiles.push(makeTile(3, 0, null));
    map.tiles.push(makeTile(3, 1, 0, null, makeWarrior('enemy', 0, 3, 1)));
    const actions = planAiActions(map, 1, new SeededRandom(2));
    const move = actions.find((a) => a.type === 'move');
    expect(move).toBeDefined();
    if (move && move.type === 'move') {
      expect(move.q).toBe(2);
      expect(move.r).toBe(0);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no `attack` action type; greedy move not implemented.

- [ ] **Step 3: Update `src/game/ai.ts`**

Replace the entire file contents:

```ts
import { hexDistance } from './hex';
import { GameMap, MapTile } from './mapGen';
import { attackableTargets } from './combat';
import { reachableTargets } from './selection';
import { Unit } from './units';
import { SeededRandom } from '../util/random';

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number };

function nearestEnemyDistance(map: GameMap, unit: Unit): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === unit.owner) continue;
    const d = hexDistance({ q: unit.q, r: unit.r }, t);
    if (d < min) min = d;
  }
  return min;
}

function greedyMoveTarget(map: GameMap, unit: Unit): MapTile | undefined {
  const targets = reachableTargets(map, unit);
  if (targets.length === 0) return undefined;
  let best: MapTile | undefined;
  let bestDist = Infinity;
  for (const t of targets) {
    const d = nearestEnemyDistanceFrom(map, unit.owner, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}

function nearestEnemyDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.unit || t.unit.owner === owner) continue;
    const d = hexDistance(tile, t);
    if (d < min) min = d;
  }
  return min;
}

export function planAiActions(
  map: GameMap,
  playerIndex: number,
  rng: SeededRandom,
): AiAction[] {
  const actions: AiAction[] = [];

  const villages = map.tiles.filter(
    (t) => t.settlement && t.settlement.owner === playerIndex,
  );

  for (const tile of villages) {
    if (rng.next() > 0.8) continue;
    actions.push({ type: 'upgrade', q: tile.q, r: tile.r });
  }

  const units = map.tiles
    .map((t) => t.unit)
    .filter((u): u is Unit => u !== null && u.owner === playerIndex && !u.hasMoved);

  for (const unit of units) {
    const attacks = attackableTargets(map, unit);
    if (attacks.length > 0) {
      const target = attacks[Math.floor(rng.next() * attacks.length)];
      actions.push({ type: 'attack', unitId: unit.id, q: target.q, r: target.r });
      continue;
    }
    if (rng.next() > 0.9) continue;
    const target = greedyMoveTarget(map, unit);
    if (target) {
      actions.push({ type: 'move', unitId: unit.id, q: target.q, r: target.r });
    }
  }

  return actions;
}
```

Note: `nearestEnemyDistance` is unused after `greedyMoveTarget` uses `nearestEnemyDistanceFrom` — remove `nearestEnemyDistance` before committing (or inline it). The final file keeps only `nearestEnemyDistanceFrom`.

- [ ] **Step 4: Update `gameController.runAiPhase` to execute attacks**

In `runAiPhase`, the action loop currently handles `upgrade` and `else` (move). Add an attack branch:

```ts
        } else if (action.type === 'attack') {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          const target = tileAt(this.map, action.q, action.r);
          if (unit && target && target.unit) {
            const attackerPlayer = players[unit.owner];
            const targetPlayer = players[target.unit.owner];
            const result = performAttack(this.map, unit, target);
            showPopup(
              `${attackerPlayer.name} attacks ${targetPlayer.name}: -${result.attackerDamage} hp`,
              { background: tribeBackground(attackerPlayer) },
            );
            if (result.targetDied) {
              showPopup(`${targetPlayer.name}'s unit dies`, { background: tribeBackground(targetPlayer) });
            } else {
              showPopup(
                `${targetPlayer.name} attacks ${attackerPlayer.name}: -${result.targetDamage} hp`,
                { background: tribeBackground(targetPlayer) },
              );
              if (result.attackerDied) {
                showPopup(`${attackerPlayer.name}'s unit dies`, { background: tribeBackground(attackerPlayer) });
              }
            }
          }
```

Adjust the existing `else` branch to be `else if (action.type === 'move')`:

```ts
        } else if (action.type === 'move') {
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit) {
            const target = tileAt(this.map, action.q, action.r)!;
            moveUnit(this.map, unit, target);
          }
        }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test`
Expected: PASS (new AI tests + existing).

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run the dev server + Chrome. Start a game with 1 enemy; play until units are adjacent; confirm: human attack prompt appears when clicking an enemy, confirm deals damage both ways with popups, units can die. Then End turn and confirm the AI attacks when possible and moves toward the human otherwise.

- [ ] **Step 7: Commit**

```bash
git add src/game/ai.ts src/controller/gameController.ts tests/ai.test.ts
git commit -m "feat: ai attacks and greedy movement toward enemies"
```

---

## Self-Review Notes

- **Spec coverage:** attack/attackDistance fields — Task 1; damage scaling, mutual response, deaths, `hasMoved` — Task 1; human attack interaction + confirm prompt — Tasks 2–3; attackable red glow — Task 4; AI prefers attack over move + greedy move — Task 5. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `attackableTargets`, `performAttack`, `attackDamage`, `pendingAttack`, `setPendingAttack`, `confirmAttack`, `cancelAttack`, `attackableKeys`, `AttackResult` names consistent across tasks. `renderMap` signature change coordinated between Task 3 (call site) and Task 4 (definition).
- **Task-ordering note:** Task 2 creates only the store field (compiles standalone); `ConfirmDialog.tsx` and `renderMap`'s new parameter are created in Tasks 3–4, and typecheck is verified green at the end of each task where the file set is complete.
- **Cleanup note:** Task 5's ai.ts includes an unused `nearestEnemyDistance` helper — the plan instructs removing it before committing.
- **Test correction:** Task 1's mutual-damage assertion originally expected the attacker at 3 HP; the target at 3 HP responds with `round(2*3/5)=1` damage, so the attacker lands at 4 HP. Fixed in the plan.
