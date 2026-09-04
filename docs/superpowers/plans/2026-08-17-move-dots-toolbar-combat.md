# Move Dots, Faster AI, Combined Toolbar, Ranged Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show red dots (not borders) on move-available cells, halve AI delays, show all self-targeted actions for the selected cell, and stop ranged attackers taking counter-damage from targets they out-range.

**Architecture:** Split map highlighting into dots (reachable) vs borders (selected/attackable); change two timing constants in the AI loop; loosen the controller/SpawnDialog selection-kind guards so toolbar actions target the selected cell's contents; gate counter-damage in `performAttack` by the target's reach.

**Tech Stack:** TypeScript, PixiJS v8, React, Vitest.

## Global Constraints

- Reachable tiles render a red filled dot (radius `hexSize * 0.14`), no border; the selected tile and attackable tiles keep a red 4px border.
- AI action pause `300 → 150` ms; per-turn minimum `5000 → 2500` ms.
- Toolbar shows, for the selected cell: village actions (Capture/Spawn/Upgrade) and unit actions (Heal/Collect), together when applicable. Move/Attack stay map-click (no buttons).
- Counter-damage in `performAttack` applies only when `hexDistance(attacker, target) <= targetUnit.attackDistance`.
- No new npm dependencies; no code comments.
- Typecheck: `npm run typecheck`; tests: `npm run test`.

---

### Task 1: Highlighting — red dots, selected-unit shape border, pulse

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: `hexCorners`, `hexToPixel`, `axialKey`, `UNIT_TYPES` (for shapes), `Ticker` type from pixi.
- Produces: `drawHighlights(container, map, selection, reachableKeys, attackableKeys, hexSize)` draws reachable dots, the selected unit's shape border, static attackable borders, and an animated selected hex border; called after `drawOwnedBorders`.

- [ ] **Step 1: Add the module-level animation stop and the unit-shape border helper**

Add a module-level variable after the imports in `src/render/mapRenderer.ts`:

```ts
let stopSelectedBorderAnimation: (() => void) | null = null;
```

Add a helper that draws a red outline around a unit's shape:

```ts
function drawUnitShapeBorder(
  container: Container,
  tile: MapTile,
  hexSize: number,
): void {
  const unit = tile.unit!;
  const p = hexToPixel(tile, hexSize);
  const r = hexSize * 0.2 + 3;
  const border = new Graphics();
  if (UNIT_TYPES[unit.type].shape === 'square') {
    border.rect(p.x - r, p.y - r, r * 2, r * 2).stroke({ width: 3, color: 0xff0000 });
  } else if (UNIT_TYPES[unit.type].shape === 'triangle') {
    border.poly([p.x, p.y - r, p.x + r, p.y + r, p.x - r, p.y + r]).stroke({ width: 3, color: 0xff0000 });
  } else {
    border.circle(p.x, p.y, r).stroke({ width: 3, color: 0xff0000 });
  }
  container.addChild(border);
}
```

Add the `MapTile` import if not present: `import { GameMap, MapTile } from '../game/mapGen';`.

- [ ] **Step 2: Replace the highlight function**

Replace `drawHighlightBorders` with:

```ts
function drawHighlights(
  container: Container,
  app: Application,
  map: GameMap,
  selection: Selection | null,
  reachableKeys: Set<string>,
  attackableKeys: Set<string>,
  hexSize: number,
): void {
  const selectedKey = selection ? axialKey(selection) : '';
  const dotRadius = hexSize * 0.14;
  for (const tile of map.tiles) {
    const key = axialKey(tile);
    if (reachableKeys.has(key) && key !== selectedKey) {
      const p = hexToPixel(tile, hexSize);
      const dot = new Graphics();
      dot.circle(p.x, p.y, dotRadius).fill(0xff0000);
      container.addChild(dot);
      continue;
    }
    if (key === selectedKey && selection && selection.kind === 'unit' && tile.unit) {
      drawUnitShapeBorder(container, tile, hexSize);
      continue;
    }
    if (key !== selectedKey && !attackableKeys.has(key)) continue;
    const points: number[] = [];
    for (const c of hexCorners(tile, hexSize)) points.push(c.x, c.y);
    const border = new Graphics();
    border.poly(points).stroke({ width: 4, color: 0xff0000 });
    container.addChild(border);
    if (key === selectedKey) {
      animateSelectedBorder(app, border, points);
    }
  }
}
```

Add the animation helper:

```ts
function animateSelectedBorder(app: Application, border: Graphics, points: number[]): void {
  if (stopSelectedBorderAnimation) {
    stopSelectedBorderAnimation();
    stopSelectedBorderAnimation = null;
  }
  const draw = (width: number): void => {
    border.clear();
    border.poly(points).stroke({ width, color: 0xff0000 });
  };
  draw(4);
  const ticker = app.ticker;
  const start = performance.now();
  const fn = (t: Ticker) => {
    const phase = ((performance.now() - start) % 1200) / 1200;
    draw(2 + 4 * Math.abs(Math.sin(phase * Math.PI * 2)));
  };
  ticker.add(fn);
  stopSelectedBorderAnimation = () => ticker.remove(fn);
}
```

- [ ] **Step 3: Update the call site and draw order**

In `renderMap`, change:

```ts
  drawHighlightBorders(container, map, selection, reachableKeys, attackableKeys, hexSize);
  drawOwnedBorders(container, map, players, hexSize);
```

to:

```ts
  drawOwnedBorders(container, map, players, hexSize);
  drawHighlights(container, app, map, selection, reachableKeys, attackableKeys, hexSize);
```

Also update the pixi import to include the `Ticker` type:

```ts
import { Application, Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: red dots for moves, shape border for selected units, pulsing selected border"
```

---

### Task 2: Ranged attackers take no counter-damage out of reach

**Files:**
- Modify: `src/game/combat.ts`
- Test: `tests/combat.test.ts`

**Interfaces:**
- Consumes: `hexDistance` (already imported), `Unit` fields.
- Produces: `performAttack` applies the target's counter-damage only when `hexDistance(attacker, target) <= targetUnit.attackDistance`.

- [ ] **Step 1: Add the failing test**

Append to `tests/combat.test.ts` (inside the `performAttack` describe):

```ts
  it('does not apply counter-damage when the attacker is beyond the target reach', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const archer: Unit = { id: 'arc', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hasAttacked: false, hasHealed: false, hasCollected: false, hp: 3, attack: 1, attackDistance: 2, spawnVillage: null };
    const far = makeTile(2, 0, TileType.Land, makeWarrior('w', 1, 2, 0, 5));
    map.tiles.push(makeTile(0, 0, TileType.Land, archer), far);
    const result = performAttack(map, archer, far);
    expect(result.targetDamage).toBe(0);
    expect(archer.hp).toBe(3);
    expect(far.unit!.hp).toBe(4);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/combat.test.ts`
Expected: FAIL — `targetDamage` is `1` (archer takes damage from distance 2).

- [ ] **Step 3: Implement the reach check**

In `src/game/combat.ts`, replace the counter-damage block:

```ts
  let targetDamage = 0;
  let attackerDied = false;
  if (!targetDied) {
    targetDamage = attackDamage(targetUnit);
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }
```

with:

```ts
  let targetDamage = 0;
  let attackerDied = false;
  const distance = hexDistance(
    { q: attacker.q, r: attacker.r },
    { q: target.q, r: target.r },
  );
  if (!targetDied && distance <= targetUnit.attackDistance) {
    targetDamage = attackDamage(targetUnit);
    attackerDied = attacker.hp - targetDamage <= 0;
    attacker.hp = Math.max(0, attacker.hp - targetDamage);
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/combat.test.ts` and `npm run typecheck`
Expected: PASS and no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: no counter-damage when the attacker is out of the target's reach"
```

---

### Task 3: Halve AI delays

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Produces: `runAiPhase` pauses 150 ms between actions and enforces a 2500 ms minimum per AI turn.

- [ ] **Step 1: Halve the per-action delay**

In `src/controller/gameController.ts` `runAiPhase`, change:

```ts
        await new Promise((resolve) => setTimeout(resolve, 300));
```

to:

```ts
        await new Promise((resolve) => setTimeout(resolve, 150));
```

- [ ] **Step 2: Halve the per-turn minimum**

Change:

```ts
      const elapsed = Date.now() - start;
      if (elapsed < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 5000 - elapsed));
      }
```

to:

```ts
      const elapsed = Date.now() - start;
      if (elapsed < 2500) {
        await new Promise((resolve) => setTimeout(resolve, 2500 - elapsed));
      }
```

- [ ] **Step 3: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/controller/gameController.ts
git commit -m "perf: halve delays between AI actions and turns"
```

---

### Task 4: Toolbar shows all self-targeted actions for the cell

**Files:**
- Modify: `src/controller/gameController.ts`
- Modify: `src/ui/SpawnDialog.tsx`
- Modify: `src/screens/hud/ActionToolbar.tsx`

**Interfaces:**
- Consumes: `canCollect`, `canHeal`, `tileResourceYield`, `villageCapacity`, `unitsInVillage`, `canAfford`, `UPGRADE_COST`, `UNIT_TYPES`.
- Produces: `captureSelectedVillage`, `upgradeSelectedVillage`, `spawnSelectedVillage` target the selected cell's contents (no `selection.kind` guard); `SpawnDialog` opens for any selection on a settlement cell; `ActionToolbar` renders all self-targeted actions for the selected cell.

- [ ] **Step 1: Loosen the village action guards in the controller**

In `src/controller/gameController.ts`:

- `captureSelectedVillage`: change `if (!selection || selection.kind !== 'village') return;` to `if (!selection) return;`
- `upgradeSelectedVillage`: change `if (!selection || selection.kind !== 'village') return;` to `if (!selection) return;`
- `spawnSelectedVillage`: change `if (!selection || selection.kind !== 'village') return;` to `if (!selection) return;`

- [ ] **Step 2: Loosen the SpawnDialog guard**

In `src/ui/SpawnDialog.tsx`, change:

```ts
  if (!map || !selection || selection.kind !== 'village') return <></>;
```

to:

```ts
  if (!map || !selection) return <></>;
```

- [ ] **Step 3: Rewrite `ActionToolbar`**

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

  const buttons: React.ReactElement[] = [];
  const unit = tile.unit;
  const settlement = tile.settlement;

  if (settlement) {
    const isOwned = settlement.owner === 0;
    const isCapturable = !isOwned && unit !== null && unit.owner === 0 && settlement.captureReady;
    if (isCapturable) {
      buttons.push(
        <button key="capture" onClick={() => gameController.captureSelectedVillage()}>
          Capture village!
        </button>,
      );
    }
    if (isOwned) {
      const capacity = villageCapacity(settlement.level);
      const count = unitsInVillage(map, tile);
      const minPrice = Math.min(...Object.values(UNIT_TYPES).map((t) => t.price));
      const spawnDisabled = !!tile.unit || count >= capacity || players[0].resources.money < minPrice;
      buttons.push(
        <button key="spawn" disabled={spawnDisabled} onClick={() => setSpawnDialogOpen(true)}>
          Spawn a unit
        </button>,
      );
      const upgradeDisabled = !canAfford(players[0].resources, UPGRADE_COST);
      buttons.push(
        <button key="upgrade" disabled={upgradeDisabled} onClick={() => gameController.upgradeSelectedVillageFromToolbar()}>
          Upgrade village
        </button>,
      );
    }
  }

  if (unit && unit.owner === 0) {
    const gained = tileResourceYield(tile);
    buttons.push(
      <button key="heal" disabled={!canHeal(unit)} onClick={() => gameController.healSelectedUnit()}>
        Heal +2 HP
      </button>,
    );
    const collectDisabled = !canCollect(unit) || (gained.wood === 0 && gained.stone === 0);
    buttons.push(
      <button key="collect" disabled={collectDisabled} onClick={() => gameController.collectSelectedUnitResources()}>
        Collect resources
      </button>,
    );
  }

  return <div id="action-toolbar">{buttons}</div>;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/controller/gameController.ts src/ui/SpawnDialog.tsx src/screens/hud/ActionToolbar.tsx
git commit -m "feat: show all self-targeted actions for the selected cell"
```

---

## Final Verification

- [ ] Run `npm run test` — all unit tests pass.
- [ ] Run `npm run typecheck` — no errors.
- [ ] Run `npm run build` — production build succeeds.
- [ ] Manual (`npm run dev`): move cells show red dots; a selected unit shows a red shape outline (no hex border); a selected village/terrain shows a pulsing red border above the territory borders; AI turns are snappier; a cell with a unit and village shows heal/collect + spawn/upgrade/capture together; archers take no damage when attacking from beyond the target's reach.
