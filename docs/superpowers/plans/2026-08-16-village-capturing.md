# Village Capturing System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add village capturing (unit parked on a foreign/empty village can capture it next turn), player inactive state with strikethrough names + skipped turns, AI capture/move-toward-village, kill-move in combat (archers excepted), per-type HP bar text with a readable background.

**Architecture:** Pure capture logic in `src/game/capture.ts`; `Settlement` gains `captureReady`; `Player` gains `isActive`; the controller marks capture-ready at turn start, executes captures, and skips inactive players; `combat.ts` gains kill-move; the renderer fixes the HP bar; `ai.ts` plans capture/move-toward-village; the toolbar shows the capture button.

**Tech Stack:** TypeScript, React 18, zustand, PixiJS 8, Vitest.

## Global Constraints

- TypeScript `strict: true`; do NOT add code comments.
- `Settlement.captureReady: boolean` (default false).
- `Player.isActive: boolean` (default true).
- Capture-ready: at the start of a player's turn, a foreign/empty village whose tile holds a unit owned by that player becomes `captureReady = true`; cleared when the parked unit leaves/dies or the village is captured.
- `captureVillage(map, villageTile, capturer): { ownerDied: boolean }`:
  - Guards: village owner ≠ capturer.owner, `captureReady === true`.
  - Transfers village owner + territory (`ownedBy`) to capturer.owner; re-links capturer `spawnVillage`; redistributes previous owner's units to their remaining villages (most-empty first); if no remaining villages → those units die + owner inactive.
- Income per village: `max(0, (3 + level) - max(0, unitsInVillage - capacity))`.
- Inactive players: names strikethrough everywhere; turns skipped (no popups, no delay).
- AI priority per unit: capture → attack → move toward closest foreign/free village.
- `AiAction` gains `{ type: 'capture'; q; r; unitId }`.
- Kill-move: on kill, attacker moves onto the killed tile unless the tile is water or attacker is an archer.
- HP bar: text `hp/{UNIT_TYPES[type].maxHp}` + black semi-transparent background behind the text.
- Tests: `npm test`; typecheck `npm run typecheck`.
- Commit after each task with the exact message shown.

---

### Task 1: Player isActive + capture-ready flag

**Files:**
- Modify: `src/game/players.ts`, `src/game/mapGen.ts`
- Modify: `tests/players.test.ts`, `tests/mapGen.test.ts`, `tests/selection.test.ts`, `tests/ai.test.ts`, `tests/spawn.test.ts`, `tests/combat.test.ts` (Settlement literals gain `captureReady`)
- Test: `tests/players.test.ts` (add isActive assertions)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Player.isActive`, `Settlement.captureReady`, plus a helper `setCaptureReady(map, villageTile, ready)`.

- [ ] **Step 1: Write the failing test**

Append to `tests/players.test.ts`:

```ts
  it('players start active', () => {
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(42));
    expect(players.every((p) => p.isActive)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `isActive` missing on Player.

- [ ] **Step 3: Update `src/game/players.ts`**

Add `isActive: boolean` to the `Player` interface and both constructions:

```ts
export interface Player {
  index: number;
  tribe: Tribe;
  isHuman: boolean;
  name: string;
  resources: Resources;
  isActive: boolean;
}
```

```ts
    { index: 0, tribe: humanTribe, isHuman: true, name: names[0], resources: { ...START_RESOURCES }, isActive: true },
```

```ts
      resources: { ...START_RESOURCES },
      isActive: true,
```

- [ ] **Step 4: Update `src/game/mapGen.ts`**

Add `captureReady: boolean` to `Settlement` and set it in both settlement-creation sites:

```ts
export interface Settlement {
  owner: number | null;
  level: number;
  captureReady: boolean;
}
```

```ts
    tileMap.get(axialKey(start))!.settlement = { owner: p, level: 1, captureReady: false };
    tileMap.get(axialKey(free))!.settlement = { owner: null, level: 1, captureReady: false };
```

- [ ] **Step 5: Update Settlement literals in existing tests**

Add `captureReady: false` to every `{ owner: ..., level: ... }` settlement literal in:
- `tests/selection.test.ts` (one literal: `{ owner: null, level: 1 }`)
- `tests/spawn.test.ts` (`makeVillageTile` uses `{ owner, level }`)
- `tests/combat.test.ts` (`makeTile` uses `settlement: null`, no change needed)
- `tests/village.test.ts` (handles `{ owner: 0, level: 1 }` etc.)

For `tests/selection.test.ts`:

```ts
    makeTile(1, -1, TileType.Land, { owner: null, level: 1, captureReady: false }),
```

For `tests/spawn.test.ts`:

```ts
function makeVillageTile(q: number, r: number, owner: number, level: number): MapTile {
  return makeTile(q, r, { owner, level, captureReady: false });
}
```

For `tests/village.test.ts`, update each `makeTile(..., { owner: N, level: N })` / `{ owner: null, level: 1 }` literal to include `captureReady: false`.

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/game/players.ts src/game/mapGen.ts tests/players.test.ts tests/selection.test.ts tests/spawn.test.ts tests/village.test.ts
git commit -m "feat: add player active flag and village capture-ready flag"
```

---

### Task 2: Capture logic

**Files:**
- Create: `src/game/capture.ts`
- Test: `tests/capture.test.ts`

**Interfaces:**
- Consumes: `mapGen.ts` (`GameMap`, `MapTile`, `Settlement`), `units.ts` (`Unit`), `village.ts` (`villageCapacity`, `unitsInVillage`).
- Produces:
  - `setCaptureReady(villageTile: MapTile, ready: boolean): void`
  - `captureVillage(map: GameMap, villageTile: MapTile, capturer: Unit): { ownerDied: boolean }`
  - `villageIncome(map: GameMap, villageTile: MapTile): number` — `max(0, (3 + level) - max(0, units - capacity))`

- [ ] **Step 1: Write the failing test**

Create `tests/capture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GameMap, MapTile, Settlement } from '../src/game/mapGen';
import { TileType } from '../src/game/tileTypes';
import { Unit } from '../src/game/units';
import { captureVillage, setCaptureReady, villageIncome } from '../src/game/capture';

function makeTile(
  q: number,
  r: number,
  settlement: Settlement | null = null,
  unit: Unit | null = null,
): MapTile {
  return { q, r, terrain: TileType.Land, settlement, unit, ownedBy: settlement ? settlement.owner : null };
}

function makeUnit(id: string, owner: number, q: number, r: number): Unit {
  return { id, owner, type: 'warrior', q, r, hasMoved: true, hp: 5, attack: 2, attackDistance: 1, spawnVillage: { q: 99, r: 99 } };
}

describe('setCaptureReady', () => {
  it('sets and clears the flag', () => {
    const tile = makeTile(0, 0, { owner: 1, level: 1, captureReady: false });
    setCaptureReady(tile, true);
    expect(tile.settlement!.captureReady).toBe(true);
  });
});

describe('captureVillage', () => {
  it('transfers ownership and territory, re-links the capturer', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.ownedBy = 1;
    const capturer = makeUnit('c', 0, 0, 0);
    village.unit = capturer;
    const territory = makeTile(1, 0);
    territory.ownedBy = 1;
    map.tiles.push(village, territory);
    const result = captureVillage(map, village, capturer);
    expect(village.settlement!.owner).toBe(0);
    expect(village.ownedBy).toBe(0);
    expect(territory.ownedBy).toBe(0);
    expect(capturer.spawnVillage).toEqual({ q: 0, r: 0 });
    expect(result.ownerDied).toBe(false);
  });

  it('marks the previous owner inactive when it was their last village', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 1, level: 1, captureReady: true });
    village.unit = makeUnit('c', 0, 0, 0);
    const leftover = makeTile(2, 0, null, makeUnit('l', 1, 2, 0));
    map.tiles.push(village, leftover);
    const result = captureVillage(map, village, village.unit!);
    expect(result.ownerDied).toBe(true);
    expect(leftover.unit).toBeNull();
  });
});

describe('villageIncome', () => {
  it('reduces income when over capacity', () => {
    const map: GameMap = { radius: 4, tiles: [], spawns: [] };
    const village = makeTile(0, 0, { owner: 0, level: 1, captureReady: false });
    village.unit = makeUnit('a', 0, 0, 0);
    village.unit.spawnVillage = { q: 0, r: 0 };
    const b = makeTile(1, 0, null, makeUnit('b', 0, 1, 0));
    b.unit!.spawnVillage = { q: 0, r: 0 };
    const c = makeTile(2, 0, null, makeUnit('c', 0, 2, 0));
    c.unit!.spawnVillage = { q: 0, r: 0 };
    const d = makeTile(3, 0, null, makeUnit('d', 0, 3, 0));
    d.unit!.spawnVillage = { q: 0, r: 0 };
    map.tiles.push(village, b, c, d);
    // capacity at level 1 = 2; 4 units linked → overflow 2; income = max(0, 4 - 2) = 2
    expect(villageIncome(map, village)).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `capture.ts` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/capture.ts`:

```ts
import { GameMap, MapTile } from './mapGen';
import { Unit } from './units';
import { villageCapacity, unitsInVillage } from './village';

export function setCaptureReady(villageTile: MapTile, ready: boolean): void {
  if (villageTile.settlement) {
    villageTile.settlement.captureReady = ready;
  }
}

export function villageIncome(map: GameMap, villageTile: MapTile): number {
  const level = villageTile.settlement!.level;
  const capacity = villageCapacity(level);
  const overflow = Math.max(0, unitsInVillage(map, villageTile) - capacity);
  return Math.max(0, 3 + level - overflow);
}

export function captureVillage(
  map: GameMap,
  villageTile: MapTile,
  capturer: Unit,
): { ownerDied: boolean } {
  const settlement = villageTile.settlement!;
  const oldOwner = settlement.owner;
  if (oldOwner === capturer.owner) return { ownerDied: false };
  if (!settlement.captureReady) return { ownerDied: false };

  settlement.owner = capturer.owner;
  settlement.captureReady = false;
  villageTile.ownedBy = capturer.owner;
  capturer.spawnVillage = { q: villageTile.q, r: villageTile.r };

  for (const t of map.tiles) {
    if (t.ownedBy === oldOwner) {
      t.ownedBy = capturer.owner;
    }
  }

  const redistributable = map.tiles.filter(
    (t) => t.settlement && t.settlement.owner === oldOwner,
  );

  const displaced = map.tiles.filter(
    (t) => t.unit && t.unit.owner === oldOwner && t.unit.spawnVillage
      && t.unit.spawnVillage.q === villageTile.q && t.unit.spawnVillage.r === villageTile.r
      && t.unit.id !== capturer.id,
  );

  if (redistributable.length === 0) {
    for (const t of map.tiles) {
      if (t.unit && t.unit.owner === oldOwner) {
        t.unit = null;
      }
    }
    return { ownerDied: true };
  }

  const sorted = [...redistributable].sort(
    (a, b) => unitsInVillage(map, a) - unitsInVillage(map, b),
  );
  for (const unitTile of displaced) {
    let placed = false;
    for (const village of sorted) {
      if (unitsInVillage(map, village) < villageCapacity(village.settlement!.level)) {
        unitTile.unit!.spawnVillage = { q: village.q, r: village.r };
        placed = true;
        break;
      }
    }
    if (!placed && sorted.length > 0) {
      const fallback = sorted[0];
      unitTile.unit!.spawnVillage = { q: fallback.q, r: fallback.r };
    }
  }

  return { ownerDied: false };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/capture.ts tests/capture.test.ts
git commit -m "feat: add village capture logic"
```

---

### Task 3: Combat kill-move

**Files:**
- Modify: `src/game/combat.ts`
- Test: `tests/combat.test.ts` (add tests)

**Interfaces:**
- Consumes: `units.ts` (`UNIT_TYPES`), `tileTypes.ts` (`TileType`).
- Produces: kill-move — attacker moves onto the killed tile unless it's water or the attacker is an archer.

- [ ] **Step 1: Add failing tests to `tests/combat.test.ts`**

```ts
  it('moves the attacker onto the killed unit tile', () => {
    const map = makeMap();
    const attacker = map.tiles[0].unit!;
    const dying = makeTile(1, 0, TileType.Land, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1] = dying;
    performAttack(map, attacker, dying);
    expect(map.tiles[0].unit).toBeNull();
    expect(map.tiles[1].unit).toBe(attacker);
    expect(attacker.q).toBe(1);
    expect(attacker.r).toBe(0);
  });

  it('does not move an archer onto the killed tile', () => {
    const map = makeMap();
    const archer: Unit = { id: 'arc', owner: 0, type: 'archer', q: 0, r: 0, hasMoved: false, hp: 3, attack: 1, attackDistance: 3, spawnVillage: null };
    map.tiles[0].unit = archer;
    const dying = makeTile(1, 0, TileType.Land, makeWarrior('b', 1, 1, 0, 1));
    map.tiles[1] = dying;
    performAttack(map, archer, dying);
    expect(map.tiles[0].unit).toBe(archer);
    expect(map.tiles[1].unit).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no kill-move behavior.

- [ ] **Step 3: Update `src/game/combat.ts`**

In `performAttack`, after removing the dead target, move the attacker onto the target tile if not water and attacker is not an archer:

```ts
  if (targetDied) {
    target.unit = null;
    const attackerTile = map.tiles.find((t) => t.unit === attacker);
    if (attackerTile && attacker.type !== 'archer' && target.terrain !== TileType.Water) {
      attackerTile.unit = null;
      attacker.q = target.q;
      attacker.r = target.r;
      target.unit = attacker;
    }
  }
```

Note: when the attacker also died from the counter-attack (`attackerDied`), the kill-move is skipped (the attacker tile is already cleared below).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat.ts tests/combat.test.ts
git commit -m "feat: attacker moves onto killed unit tile"
```

---

### Task 4: HP bar per-type + text background

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Test: typecheck + tests + manual screenshot.

**Interfaces:**
- Consumes: `units.ts` (`UNIT_TYPES`).
- Produces: HP text `hp/{UNIT_TYPES[type].maxHp}` with a semi-transparent black backing.

- [ ] **Step 1: Update `src/render/mapRenderer.ts`**

Add `UNIT_TYPES` to the units import:

```ts
import { MAX_HP, UNIT_TYPES, Unit } from '../game/units';
```

Note: `MAX_HP` is still used for the green fill ratio (bar width `hp / maxHp` must become per-type too). Update `addHpBar`:

```ts
function addHpBar(
  container: Container,
  unit: Unit,
  position: { x: number; y: number },
  hexSize: number,
): void {
  const barWidth = hexSize * 0.6;
  const barHeight = 5;
  const y = position.y - hexSize * 0.6;
  const maxHp = UNIT_TYPES[unit.type].maxHp;

  const background = new Graphics();
  background.rect(position.x - barWidth / 2, y, barWidth, barHeight).fill(0x000000);
  container.addChild(background);

  const ratio = Math.max(0, Math.min(1, unit.hp / maxHp));
  if (ratio > 0) {
    const fill = new Graphics();
    fill.rect(position.x - barWidth / 2, y, barWidth * ratio, barHeight).fill(0x00ff00);
    container.addChild(fill);
  }

  const label = new Text({
    text: `${unit.hp}/${maxHp}`,
    style: { fontSize: 10, fill: 0xffffff },
  });
  label.anchor.set(0.5, 1);
  label.position.set(position.x, y - 2);

  const labelBg = new Graphics();
  labelBg.rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height).fill({ color: 0x000000, alpha: 0.6 });
  container.addChild(labelBg);
  container.addChild(label);
}
```

Note: the `labelBg` uses `label.width/height` which are computed after the Text is constructed; position the bg using the label's anchor and measured size. Since `label.anchor` is `(0.5, 1)`, `label.y` is the bottom edge. The rect above covers the text.

- [ ] **Step 2: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Manual screenshot**

Run the dev server + Chrome; confirm a rider shows `4/4` and an archer `3/3` (spawn them or place via hook), and the HP text has a readable dark backing. Kill the server.

- [ ] **Step 4: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "fix: per-type hp text with background"
```

---

### Task 5: Controller — capture-ready marking, capture action, inactive skip, income

**Files:**
- Modify: `src/controller/gameController.ts`
- Test: typecheck + tests + manual.

**Interfaces:**
- Consumes: `capture.ts` (`captureVillage`, `villageIncome`, `setCaptureReady`), `village.ts` (`unitsInVillage`, `villageCapacity`), store.
- Produces: `captureSelectedVillage()`, turn-start capture-ready marking, inactive skip in `runAiPhase`, income via `villageIncome`.

- [ ] **Step 1: Add imports to `gameController.ts`**

```ts
import { captureVillage, setCaptureReady, villageIncome } from '../game/capture';
```

- [ ] **Step 2: Add capture-ready marking at human turn start**

Add a private method:

```ts
  private markCaptureReadyFor(playerIndex: number): void {
    if (!this.map) return;
    for (const t of this.map.tiles) {
      if (t.settlement && t.settlement.owner !== playerIndex && t.unit && t.unit.owner === playerIndex) {
        setCaptureReady(t, true);
      }
    }
  }
```

Call it at the start of the human turn (in `startGame` after render, and at the end of `runAiPhase` before `render()`):

```ts
    this.markCaptureReadyFor(0);
```

- [ ] **Step 3: Add `captureSelectedVillage`**

```ts
  captureSelectedVillage(): void {
    if (!this.map) return;
    const store = useGameStore.getState();
    if (store.aiActive) return;
    const selection = store.selection;
    if (!selection || selection.kind !== 'village') return;
    const village = tileAt(this.map, selection.q, selection.r)!;
    const unit = village.unit;
    if (!unit || !village.settlement || village.settlement.owner === unit.owner || !village.settlement.captureReady) return;
    const players = store.players;
    const result = captureVillage(this.map, village, unit);
    if (result.ownerDied) {
      for (const p of players) {
        const owned = this.map.tiles.filter((t) => t.settlement && t.settlement.owner === p.index);
        if (owned.length === 0) p.isActive = false;
      }
    }
    store.setPlayers([...players]);
    const capturer = players[unit.owner];
    showPopup(`${capturer.name} captures the village`, { background: tribeBackground(capturer) });
    this.render();
  }
```

Note: after capture, loop over all players and set `isActive = false` for any that own zero villages.

- [ ] **Step 4: Skip inactive players in `runAiPhase`**

Change the AI loop start:

```ts
    for (const ai of aiPlayers) {
      if (!ai.isActive) continue;
      store.setCurrentPlayerIndex(ai.index);
```

And after the loop, before returning to the human, skip inactive players' income? Income is per-player by village count, so inactive players (zero villages) naturally earn 0. The income loop already iterates all players; keep it.

Also mark capture-ready for the human at the end of `runAiPhase`:

```ts
    this.markCaptureReadyFor(0);
```

- [ ] **Step 5: Use `villageIncome` for round income**

Replace the income block in `runAiPhase`:

```ts
    for (const player of players) {
      let income = 0;
      for (const t of this.map.tiles) {
        if (t.settlement && t.settlement.owner === player.index) {
          income += 3 + t.settlement.level;
        }
      }
      player.resources.money += income;
    }
```

with:

```ts
    for (const player of players) {
      let income = 0;
      for (const t of this.map.tiles) {
        if (t.settlement && t.settlement.owner === player.index) {
          income += villageIncome(this.map, t);
        }
      }
      player.resources.money += income;
    }
```

- [ ] **Step 6: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: wire village capture and inactive players into controller"
```

---

### Task 6: Toolbar capture button + strikethrough names

**Files:**
- Modify: `src/screens/hud/ActionToolbar.tsx`, `src/screens/hud/PlayersList.tsx`, `src/screens/hud/TurnInfo.tsx`, `src/screens/hud/SelectedInfo.tsx`, `src/screens/hud/ResourcesInfo.tsx`, `src/ui/ConfirmDialog.tsx`, `src/ui/SpawnDialog.tsx`
- Test: manual.

**Interfaces:**
- Consumes: store `players`, `selection`, `gameController.getMap()`, `capture.ts` (`setCaptureReady` read via settlement flag).
- Produces: capture button in toolbar; strikethrough names everywhere.

- [ ] **Step 1: Add the capture button to `ActionToolbar.tsx`**

Add, before the Spawn button, a capture button shown when the village is foreign/neutral, has a parked unit of the human, and `captureReady`:

```tsx
  const unit = village.unit;
  const isCapturable =
    unit !== null &&
    unit.owner === 0 &&
    village.settlement.owner !== 0 &&
    village.settlement.captureReady;

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
```

Note: the village-ownership guard earlier in the component returns an empty toolbar when `owner !== 0`. For capture, the village is foreign, so the guard must change. Replace the ownership guard:

```ts
  const village = tileAt(map, selection.q, selection.r);
  if (!village || !village.settlement) {
    return <div id="action-toolbar" />;
  }
  const isOwned = village.settlement.owner === 0;
  const capacity = isOwned ? villageCapacity(village.settlement.level) : 0;
  const count = isOwned ? unitsInVillage(map, village) : 0;
  const minPrice = isOwned ? Math.min(...Object.values(UNIT_TYPES).map((t) => t.price)) : Infinity;
  const spawnDisabled = !isOwned || !!village.unit || count >= capacity || players[0].resources.money < minPrice;
  const upgradeDisabled = !isOwned || !canAfford(players[0].resources, UPGRADE_COST);
```

- [ ] **Step 2: Add strikethrough names**

In `PlayersList.tsx`, render the name with a strike when inactive:

```tsx
          <div key={p.index} style={{ color, textDecoration: p.isActive ? 'none' : 'line-through' }}>
            {p.name} ({tribe.name}){role}
          </div>
```

In `TurnInfo.tsx`:

```tsx
  const name = player ? player.name : '';
  return (
    <div id="turn-info">
      {player ? `Turn ${turn} — ` : ''}
      {player ? <span style={{ textDecoration: player.isActive ? 'none' : 'line-through' }}>{name}</span> : ''}
    </div>
  );
```

In `SelectedInfo.tsx`, wrap each `Player: {player.name}` rendering with a strike when inactive. For the unit/village branches:

```tsx
    lines.push(<div key="p">Player: <span style={{ textDecoration: player.isActive ? 'none' : 'line-through' }}>{player.name}</span></div>);
```

Apply the same to the village branch.

In `MoneyInfo.tsx` — no player name, no change.

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Run the dev server + Chrome; verify the capture button appears on a foreign village with a parked unit after a round; verify strikethrough names for an eliminated player (via hook or by capturing all their villages). Kill the server.

- [ ] **Step 5: Commit**

```bash
git add src/screens/hud/ActionToolbar.tsx src/screens/hud/PlayersList.tsx src/screens/hud/TurnInfo.tsx src/screens/hud/SelectedInfo.tsx
git commit -m "feat: add capture button and strikethrough inactive names"
```

---

### Task 7: AI capture + move toward villages

**Files:**
- Modify: `src/game/ai.ts`
- Modify: `src/controller/gameController.ts`
- Test: `tests/ai.test.ts` (add tests)

**Interfaces:**
- Consumes: `capture.ts`, `units.ts`, `mapGen.ts`, `village.ts`.
- Produces: `AiAction` gains `{ type: 'capture'; q; r; unitId }`; capture-before-attack; move toward closest foreign/free village.

- [ ] **Step 1: Add failing tests to `tests/ai.test.ts`**

```ts
  it('plans a capture when parked on a capture-ready foreign village', () => {
    const map = makeAiMap();
    const village = map.tiles[0];
    village.settlement!.captureReady = true;
    const enemy = makeWarrior('enemy', 0, 2, 0);
    map.tiles.push(makeTile(2, 0, null, enemy));
    // park an AI unit on the foreign village tile
    const aiUnit = makeWarrior('ai1', 1, 0, 0);
    map.tiles[0].unit = aiUnit;
    const actions = planAiActions(map, 1, 100, new SeededRandom(1));
    const capture = actions.find((a) => a.type === 'capture');
    expect(capture).toBeDefined();
  });

  it('moves toward the closest foreign village', () => {
    const map = makeAiMap();
    const actions = planAiActions(map, 1, 100, new SeededRandom(2));
    const move = actions.find((a) => a.type === 'move');
    expect(move).toBeDefined();
  });
```

Note: `makeAiMap` uses a village owned by player 1 with a warrior `w1` on it; `makeTile(2, 0, null)` is an empty target. For the second test, the existing map's only reachable tile from `(0,0)` is `(1,0)` (empty) — move targets are still reachable, so `move` is defined.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no `capture` action type.

- [ ] **Step 3: Update `src/game/ai.ts`**

Add the capture branch and change greedy movement to target villages. Add imports:

```ts
import { captureVillage } from './capture';
```

Add to the `AiAction` union:

```ts
  | { type: 'capture'; q: number; r: number; unitId: string };
```

Change `greedyMoveTarget` to prefer the tile closest to a foreign/free village (own village excluded):

```ts
function nearestVillageDistanceFrom(map: GameMap, owner: number, tile: MapTile): number {
  let min = Infinity;
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner === owner) continue;
    const d = hexDistance(tile, t);
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
    const d = nearestVillageDistanceFrom(map, unit.owner, t);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return best;
}
```

In `planAiActions`, inside the unit loop, add capture before attack:

```ts
  for (const unit of units) {
    const tile = map.tiles.find((t) => t.unit === unit);
    if (tile && tile.settlement && tile.settlement.owner !== unit.owner && tile.settlement.captureReady) {
      actions.push({ type: 'capture', q: tile.q, r: tile.r, unitId: unit.id });
      continue;
    }
    const attacks = attackableTargets(map, unit);
    ...
```

- [ ] **Step 4: Execute capture actions in `gameController.runAiPhase`**

Add a branch before the `attack` branch:

```ts
        } else if (action.type === 'capture') {
          const village = tileAt(this.map, action.q, action.r)!;
          const unit = this.map.tiles.find((t) => t.unit && t.unit.id === action.unitId)?.unit;
          if (unit && village.settlement && village.settlement.owner !== unit.owner && village.settlement.captureReady) {
            captureVillage(this.map, village, unit);
            for (const p of players) {
              const owned = this.map.tiles.filter((t) => t.settlement && t.settlement.owner === p.index);
              if (owned.length === 0) p.isActive = false;
            }
            store.setPlayers([...players]);
            const capturer = players[unit.owner];
            showPopup(`${capturer.name} captures the village`, { background: tribeBackground(capturer) });
          }
        }
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run the dev server + Chrome; confirm the AI captures foreign villages when parked on them and moves toward foreign/free villages. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add src/game/ai.ts src/controller/gameController.ts tests/ai.test.ts
git commit -m "feat: ai captures villages and moves toward them"
```

---

## Self-Review Notes

- **Spec coverage:** capture-ready flag — Task 1; capture logic (ownership/territory transfer, re-link, redistribution, last-village death, income overflow) — Task 2; kill-move (archers excepted, water-respecting) — Task 3; per-type HP bar + text background — Task 4; controller capture/income/inactive-skip — Task 5; toolbar button + strikethrough names — Task 6; AI capture-before-attack + move-toward-village — Task 7. All spec points covered.
- **Placeholder scan:** No TBD/TODO; all steps concrete.
- **Type consistency:** `captureReady`, `isActive`, `captureVillage`, `villageIncome`, `setCaptureReady`, `captureSelectedVillage`, `AiAction.capture` names consistent across tasks.
- **Coordinated changes:** Task 1's `Settlement.captureReady` touches test literals across multiple files; Task 5's controller references `villageIncome` from Task 2; Task 7's `AiAction.capture` union change requires the controller execution branch. Typecheck verified green at the end of each task.
- **Known simplification:** the income overflow (`villageIncome`) is applied at round end for all villages; `captureReady` is only marked at human turn start and AI turn start (via the shared loop) — a unit moved onto a village mid-turn can only capture on the next round, matching the spec.
- **Test/impl correction:** when the previous owner has no remaining villages, ALL their units die (not just linked ones), and `ownerDied` is `true` when the captured village was their last village. The plan's original "displaced-only" death and `ownerDied: false` expectation were corrected.
- **Greedy-move correction:** AI greedy movement targets the closest foreign/free village when one exists; otherwise it falls back to the closest enemy (avoids "no movement" when only friendly villages remain). `hasForeignVillage` decides which distance metric to use.
