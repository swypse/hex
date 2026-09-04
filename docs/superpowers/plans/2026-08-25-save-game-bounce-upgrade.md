# Selection Animation, Upgrade Cost, and Single-Player Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed up and reorient the selected-unit bounce (base → up → base, ×2 faster), show the cost on the Upgrade village action, and add a localStorage-backed single-player save/resume feature behind an abstract storage service.

**Architecture:** A `StorageService` interface + `LocalStorageService` implementation in `src/storage/`, with a `createSaveRepository(storage)` factory serializing `GameStateSnapshot` to JSON. `gameController` auto-saves at the start of each single-player turn (and once at game start), clears on game over, and exposes `resumeGame()` to rebuild the simulator from a saved snapshot. The start screen shows a `Resume` button when a save exists.

**Tech Stack:** TypeScript, PixiJS 8, Zustand 5, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**` (except none needed), `src/net/**`, `src/store/**`, `src/ui/kit/**`.
- No new `.tsx` files; no React imports.
- Saves are single-player only (`netMode === 'single'`).
- The bounce must be base → up → base in 300ms.

---

### Task 1: Bounce tweak (×2 faster, base → up → base)

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `updateSelectedBounce` duration 300ms and negative amplitude (up).

- [ ] **Step 1: Speed up and flip the bounce direction**

Edit `src/render/mapRenderer.ts` — inside `updateSelectedBounce`, replace the tween body:

```ts
      const t = Math.min(1, (performance.now() - start) / 600);
      this.bounceSprite.position.y = this.bounceBaseY + Math.sin(t * Math.PI) * amp;
```

with:

```ts
      const t = Math.min(1, (performance.now() - start) / 300);
      this.bounceSprite.position.y = this.bounceBaseY - Math.sin(t * Math.PI) * amp;
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: bounce selected unit 2x faster and upward"
```

---

### Task 2: Show cost on the Upgrade village action

**Files:**
- Modify: `src/ui/hud/toolbarSpecs.ts`

**Interfaces:**
- Produces: the `upgrade` action label reads `Upgrade village (2w, 1s, 2m)` from `UPGRADE_COST`.

- [ ] **Step 1: Update the label**

Edit `src/ui/hud/toolbarSpecs.ts` — replace the upgrade spec:

```ts
      if (!upgradeDisabled) {
        out.push({ key: 'upgrade', label: 'Upgrade village', disabled: false, onClick: () => gameController.upgradeSelectedVillageFromToolbar() });
      }
```

with:

```ts
      if (!upgradeDisabled) {
        out.push({
          key: 'upgrade',
          label: `Upgrade village (${UPGRADE_COST.wood}w, ${UPGRADE_COST.stone}s, ${UPGRADE_COST.money}m)`,
          disabled: false,
          onClick: () => gameController.upgradeSelectedVillageFromToolbar(),
        });
      }
```

(`UPGRADE_COST` is already imported from `../../game/resources`.)

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/hud/toolbarSpecs.ts
git commit -m "feat: show cost on upgrade village action"
```

---

### Task 3: Storage service + save repository

**Files:**
- Create: `src/storage/storageService.ts`
- Create: `src/storage/saveGame.ts`
- Test: `tests/storage.test.ts`

**Interfaces:**
- Produces: `StorageService` (`getItem(key): string | null`, `setItem(key, value): void`, `removeItem(key): void`), `LocalStorageService`, default `storageService`; `SaveRepository` (`save(snapshot)`, `load(): GameStateSnapshot | null`, `hasSave(): boolean`, `clear(): void`), `createSaveRepository(storage)`, default `saveRepository`.

- [ ] **Step 1: Write the failing test**

Create `tests/storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSaveRepository } from '../src/storage/saveGame';
import { type StorageService } from '../src/storage/storageService';
import { type GameStateSnapshot } from '../src/game/state';
import { TileType } from '../src/game/tileTypes';

class FakeStorage implements StorageService {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function sampleSnapshot(): GameStateSnapshot {
  return {
    map: {
      radius: 1,
      tiles: [{ q: 0, r: 0, terrain: TileType.GrasslandLand, settlement: null, unit: null, ownedBy: null, claimedByVillage: null, building: null, exploredBy: [0] }],
      spawns: [],
    },
    players: [{ index: 0, tribe: 0, isHuman: true, name: 'P', resources: { wood: 3, stone: 2, money: 5, ore: 0 }, score: 0, kills: 0, skills: [], isActive: true }],
    mode: 'capture',
    turn: 3,
    currentPlayerIndex: 0,
    gameOver: false,
    winnerIndex: null,
    expectedTurns: 15,
    bonusAwarded: false,
  };
}

describe('saveRepository', () => {
  let storage: FakeStorage;
  let repo: ReturnType<typeof createSaveRepository>;

  beforeEach(() => {
    storage = new FakeStorage();
    repo = createSaveRepository(storage);
  });

  it('round-trips a snapshot', () => {
    repo.save(sampleSnapshot());
    const loaded = repo.load();
    expect(loaded?.turn).toBe(3);
    expect(loaded?.players[0].name).toBe('P');
    expect(loaded?.map.tiles[0].q).toBe(0);
    expect(loaded?.mode).toBe('capture');
  });

  it('hasSave reflects save and clear', () => {
    expect(repo.hasSave()).toBe(false);
    repo.save(sampleSnapshot());
    expect(repo.hasSave()).toBe(true);
    repo.clear();
    expect(repo.hasSave()).toBe(false);
  });

  it('load returns null when nothing is saved', () => {
    expect(repo.load()).toBeNull();
  });

  it('load returns null on corrupt data', () => {
    storage.setItem('hex-save-v1', '{not json');
    expect(repo.load()).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- storage`
Expected: FAIL — cannot find module `../src/storage/saveGame`.

- [ ] **Step 3: Create the storage service**

Create `src/storage/storageService.ts`:

```ts
export interface StorageService {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class LocalStorageService implements StorageService {
  getItem(key: string): string | null {
    return window.localStorage.getItem(key);
  }
  setItem(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  }
  removeItem(key: string): void {
    window.localStorage.removeItem(key);
  }
}

export const storageService: StorageService = new LocalStorageService();
```

- [ ] **Step 4: Create the save repository**

Create `src/storage/saveGame.ts`:

```ts
import { type GameStateSnapshot } from '../game/state';
import { storageService, type StorageService } from './storageService';

const SAVE_KEY = 'hex-save-v1';

export interface SaveRepository {
  save(snapshot: GameStateSnapshot): void;
  load(): GameStateSnapshot | null;
  hasSave(): boolean;
  clear(): void;
}

export function createSaveRepository(storage: StorageService): SaveRepository {
  return {
    save: (snapshot) => storage.setItem(SAVE_KEY, JSON.stringify(snapshot)),
    load: () => {
      const raw = storage.getItem(SAVE_KEY);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as GameStateSnapshot;
      } catch {
        return null;
      }
    },
    hasSave: () => storage.getItem(SAVE_KEY) !== null,
    clear: () => storage.removeItem(SAVE_KEY),
  };
}

export const saveRepository: SaveRepository = createSaveRepository(storageService);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- storage`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/storage tests/storage.test.ts
git commit -m "feat: add abstract storage service and save repository"
```

---

### Task 4: Auto-save, resume, and clear in gameController

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `saveRepository` from `../storage/saveGame`; existing `presentTurnStarted`, `startGame`, `presentGameOver`, `syncStore`.
- Produces: methods `saveGame(): void` and `resumeGame(): void`; auto-save on your turn (single-player); save once at single-player game start; clear save on game over.

- [ ] **Step 1: Import the repository**

Edit `src/controller/gameController.ts` — add near the top imports:

```ts
import { saveRepository } from '../storage/saveGame';
```

- [ ] **Step 2: Add `saveGame` and `resumeGame` methods**

Edit `src/controller/gameController.ts` — add these two methods right after `adoptSnapshot`:

```ts
  saveGame(): void {
    if (!this.sim || useGameStore.getState().netMode !== 'single') return;
    saveRepository.save(this.sim.snapshot());
  }

  resumeGame(): void {
    const snap = saveRepository.load();
    if (!snap) return;
    this.sim = Simulator.fromSnapshot(snap);
    const store = useGameStore.getState();
    store.setPlayers(snap.players);
    store.setMode(snap.mode);
    store.setTurn(snap.turn);
    store.setCurrentPlayerIndex(snap.currentPlayerIndex);
    store.setGameOver(snap.gameOver);
    store.setWinnerIndex(snap.winnerIndex);
    store.setExpectedTurns(snap.expectedTurns);
    store.setBonusAwarded(snap.bonusAwarded);
    store.setLocalPlayerIndex(0);
    store.setNetMode('single');
    store.setAiActive(snap.currentPlayerIndex !== 0);
    store.setSelection(null);
    store.setScreen('game');
  }
```

- [ ] **Step 3: Save once at single-player game start**

Edit `src/controller/gameController.ts` — in `startGame`, after the final `this.applyFitToScreen();` and before the closing brace of the method, add:

```ts
    this.saveGame();
```

- [ ] **Step 4: Auto-save at the start of your turn**

Edit `src/controller/gameController.ts` — in `presentTurnStarted`, after the center-message line, add:

```ts
    if (playerIndex === store.localPlayerIndex && store.netMode === 'single') this.saveGame();
```

- [ ] **Step 5: Clear the save on game over**

Edit `src/controller/gameController.ts` — in `presentGameOver`, after `store.setSelection(null);`, add:

```ts
    saveRepository.clear();
```

- [ ] **Step 6: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: auto-save single-player games and add resume"
```

---

### Task 5: Resume button on the start screen

**Files:**
- Modify: `src/ui/screens/StartScreen.ts`

**Interfaces:**
- Consumes: `saveRepository.hasSave()`, `gameController.resumeGame()`.
- Produces: a `Resume` button as the first menu option when a save exists; dynamic layout for 2–3 options.

- [ ] **Step 1: Add imports**

Edit `src/ui/screens/StartScreen.ts` — add:

```ts
import { gameController } from '../../controller/gameController';
import { saveRepository } from '../../storage/saveGame';
```

- [ ] **Step 2: Build the menu with a conditional Resume button**

Edit `src/ui/screens/StartScreen.ts` — in `mount`, replace the button construction block:

```ts
    const single = new Button({
      label: 'Single player',
      width: 240,
      selected: true,
      onClick: () => useGameStore.getState().setScreen('setup'),
    });
    const multi = new Button({
      label: 'Multiplayer',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('lobby'),
    });
```

with:

```ts
    const single = new Button({
      label: 'Single player',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('setup'),
    });
    const multi = new Button({
      label: 'Multiplayer',
      width: 240,
      onClick: () => useGameStore.getState().setScreen('lobby'),
    });
    const buttons: Button[] = [single, multi];
    if (saveRepository.hasSave()) {
      buttons.unshift(new Button({ label: 'Resume', width: 240, onClick: () => gameController.resumeGame() }));
    }
    this.buttons = buttons;
    this.buttons[0].selected = true;
```

and remove the old line `this.buttons = [single, multi];` (it is replaced by the block above).

- [ ] **Step 3: Dynamic layout**

Edit `src/ui/screens/StartScreen.ts` — replace `layout`:

```ts
  private layout(): void {
    if (!this.root || !this.host) return;
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    this.title!.position.set(w / 2, h / 2 - 130);
    let y = h / 2 - 40;
    for (const b of this.buttons) {
      b.position.set(w / 2 - 120, y);
      y += 64;
    }
    this.hint!.position.set(w / 2, y + 6);
  }
```

- [ ] **Step 4: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/StartScreen.ts
git commit -m "feat: show Resume button on start screen when a save exists"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (bounce ×2 + upward) → Task 1; Section 2 (upgrade cost) → Task 2; Section 3 (storage service + repository) → Task 3; Section 4 (auto-save / clear) → Task 4; Section 5 (Resume button) → Tasks 4 + 5.
- **Type consistency:** `StorageService`/`SaveRepository`/`createSaveRepository`/`saveRepository` are defined once in Task 3 and consumed by `gameController` (Task 4) and `StartScreen` (Task 5). `gameController.saveGame()` / `resumeGame()` (Task 4) are called by `presentTurnStarted`, `startGame`, and `StartScreen`. The test key `hex-save-v1` matches `saveGame.ts`.
- **Manual smoke test (final, in a browser):**
  1. Bounce: selecting your own unit pops it up and back in ~300ms; re-selecting bounces once more.
  2. Upgrade action label shows `Upgrade village (2w, 1s, 2m)`.
  3. Start a single-player game, play a turn → the start screen now shows **Resume**; resume restores turn/resources/positions; end a game → Resume disappears.
