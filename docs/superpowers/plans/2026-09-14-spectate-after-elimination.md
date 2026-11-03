# Spectate after Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In single-player capture mode, when the human player is eliminated (loses their last village) while 2+ AIs are still fighting, prompt **Watch or finish?** — Watch reveals the whole map and auto-plays the AI contest to a winner; Finish ends now and shows Game Over. A **"Exit to main menu"** button appears above the turn bar while watching.

**Architecture:** A pure predicate `shouldPromptWatch` in `gameMode.ts` decides when to show the prompt (tested in isolation). `gameController.runCommand` checks it after syncing and opens a `watchingPrompt` overlay. Choosing Watch calls `watchGame()` which reveals the map and starts an autoplay loop that issues `endTurn` repeatedly through the existing (already-animated) command path. A `Simulator.endNow()` ends the game on Finish. A new `HudWatchExit` widget shows the exit button.

**Tech Stack:** TypeScript, PixiJS, Zustand, Vitest (`npm test`), `npm run typecheck`.

## Global Constraints

- Single-player (`netMode === 'single'`) and capture mode only.
- The prompt appears at most once; the autoplay loop is guarded against re-entry.
- No changes to `GAME.md`; no new dependencies.
- Follow existing code style: no comments except per project conventions; match the widget/overlay patterns already in the codebase.
- Run `npm test` and `npm run typecheck` before every commit.
- All task relationships: Task 1 simulator, Task 2 predicate, Task 3 store, Task 4 i18n, Task 5 controller, Task 6 prompt overlay, Task 7 exit button, Task 8 regression gate.

---

### Task 1: Simulator — end-after-one-round and `endNow()`

**Files:**
- Modify: `src/game/simulator.ts`
- Test: `tests/simulatorTurn.test.ts`

**Interfaces:**
- Consumes: existing `Simulator`, `buildPlayers`, `makeTestMap`, `tileAt`.
- Produces:
  - `doEndTurn()` now ends after **one full round** when no active human player remains (instead of bursting through up to 64 iterations).
  - `public endNow(): void` — awards temple/achievement scores, computes the winner via `computeWinner(this.players, this.map)`, and calls the existing private `endGame(winnerIndex)`. No-op if `this.gameOver`.

- [x] **Step 1: Write the failing test**

Append a new `describe` block to `tests/simulatorTurn.test.ts`:

```ts
describe('spectate turn advance', () => {
  it('endTurn advances exactly one round when no active human remains', () => {
    const map = makeTestMap(3);
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    villageFor(map, 1, 0, 2);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    players[0]!.isActive = false; // human eliminated
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5, aiRng: () => new SeededRandom(2) });
    sim.startGame();
    sim.drainEvents();
    const startTurn = sim.turn;
    sim.applyCommand({ type: 'endTurn' });
    expect(sim.turn).toBe(startTurn + 1);
    expect(sim.currentPlayerIndex).not.toBe(0);
  });

  it('endNow ends the game with a computed winner', () => {
    const map = makeTestMap(3);
    villageFor(map, 0, 0, 0);
    villageFor(map, 0, 2, 1);
    const players = buildPlayers(Tribe.Villagers, 1, new SeededRandom(1));
    players[1]!.score = 50;
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    sim.startGame();
    sim.drainEvents();
    sim.endNow();
    expect(sim.gameOver).toBe(true);
    expect(sim.winnerIndex).toBe(1);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/simulatorTurn.test.ts -t 'spectate'`
Expected: FAIL — `endNow` is not a function; the one-round assertion fails because `doEndTurn` bursts several rounds.

- [x] **Step 3: Implement `doEndTurn` one-round return**

In `src/game/simulator.ts`, inside `doEndTurn`, after the round-boundary block (the `if (next === 0) { ... }` block) and before `this.currentPlayerIndex = next;`, add an early return when no active human remains:

```ts
      if (next === 0) {
        this.runPirateTurn();
        this.applyIncome();
        this.turn += 1;
        this.runBottleTurn();
        this.growTemples();
        this.resetUnitFlags();
        this.evaluateAchievementsForAll();
        if (this.checkEndConditions()) return;
        const hasActiveHuman = this.players.some((p) => p.isActive && p.isHuman);
        if (!hasActiveHuman) return;
      }
```

- [x] **Step 4: Implement `endNow()`**

Add this public method to `Simulator` (place it near `checkEndConditions`):

```ts
  /** End the game immediately with the current-board winner (used when an
   *  eliminated player chooses "Finish" instead of watching). */
  endNow(): void {
    if (this.gameOver) return;
    awardTempleScores(this.map, this.players);
    awardAchievementScores(this.players);
    this.endGame(computeWinner(this.players, this.map));
  }
```

(`awardTempleScores`, `awardAchievementScores`, and `computeWinner` are already imported in this file.)

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/simulatorTurn.test.ts`
Expected: PASS.

- [x] **Step 6: Typecheck and commit**

Run: `npm run typecheck` and `npm test`
Then:
```bash
git add src/game/simulator.ts tests/simulatorTurn.test.ts
git commit -m "feat: end capture turn after one round when no human remains; add Simulator.endNow"
```

---

### Task 2: Pure predicate `shouldPromptWatch`

**Files:**
- Modify: `src/game/gameMode.ts`
- Test: `tests/gameMode.test.ts`

**Interfaces:**
- Consumes: `GameMode` type (already in `gameMode.ts`).
- Produces:
  - `export interface WatchPromptCheck { netMode: string; mode: GameMode; gameOver: boolean; watching: boolean; localActive: boolean; overlayKind: string | null }`
  - `export function shouldPromptWatch(c: WatchPromptCheck): boolean` — returns true iff `netMode === 'single' && mode === 'capture' && !gameOver && !watching && !localActive && overlayKind !== 'watchingPrompt'`.

- [x] **Step 1: Write the failing test**

Append to `tests/gameMode.test.ts`:

```ts
describe('shouldPromptWatch', () => {
  const base = { netMode: 'single', mode: 'capture' as const, gameOver: false, watching: false, localActive: false, overlayKind: null };
  it('prompts when the local player is eliminated in single capture', () => {
    expect(shouldPromptWatch(base)).toBe(true);
  });
  it('does not prompt on a live player', () => {
    expect(shouldPromptWatch({ ...base, localActive: true })).toBe(false);
  });
  it('does not prompt when game is over', () => {
    expect(shouldPromptWatch({ ...base, gameOver: true })).toBe(false);
  });
  it('does not prompt in multiplayer or non-capture mode', () => {
    expect(shouldPromptWatch({ ...base, netMode: 'host' })).toBe(false);
    expect(shouldPromptWatch({ ...base, mode: 'turns30' })).toBe(false);
  });
  it('does not prompt while already watching or already prompted', () => {
    expect(shouldPromptWatch({ ...base, watching: true })).toBe(false);
    expect(shouldPromptWatch({ ...base, overlayKind: 'watchingPrompt' })).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/gameMode.test.ts -t 'shouldPromptWatch'`
Expected: FAIL — `shouldPromptWatch` is not defined.

- [x] **Step 3: Implement `shouldPromptWatch`**

Add to `src/game/gameMode.ts`:

```ts
export interface WatchPromptCheck {
  netMode: string;
  mode: GameMode;
  gameOver: boolean;
  watching: boolean;
  localActive: boolean;
  overlayKind: string | null;
}

export function shouldPromptWatch(c: WatchPromptCheck): boolean {
  return (
    c.netMode === 'single' &&
    c.mode === 'capture' &&
    !c.gameOver &&
    !c.watching &&
    !c.localActive &&
    c.overlayKind !== 'watchingPrompt'
  );
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/gameMode.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Then:
```bash
git add src/game/gameMode.ts tests/gameMode.test.ts
git commit -m "feat: add shouldPromptWatch predicate for spectate prompt"
```

---

### Task 3: Store — `watching` flag and `watchingPrompt` overlay

**Files:**
- Modify: `src/store/gameStore.ts`
- Test: `tests/gameStore.test.ts`

**Interfaces:**
- Consumes: existing `OverlayState`, `create` from zustand.
- Produces:
  - `OverlayState` gains `| { kind: 'watchingPrompt' }`.
  - Store interface gains `watching: boolean` and `setWatching: (v: boolean) => void`.
  - Initial state `watching: false`.

- [x] **Step 1: Write the failing test**

Append to `tests/gameStore.test.ts`:

```ts
it('toggles the watching flag', () => {
  const s = useGameStore.getState();
  expect(s.watching).toBe(false);
  s.setWatching(true);
  expect(useGameStore.getState().watching).toBe(true);
  useGameStore.getState().setWatching(false);
  expect(useGameStore.getState().watching).toBe(false);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/gameStore.test.ts -t 'watching'`
Expected: FAIL — `watching` is undefined / `setWatching` is not a function.

- [x] **Step 3: Implement the store changes**

In `src/store/gameStore.ts`:

1. Add to `OverlayState` union:
```ts
  | { kind: 'watchingPrompt' }
```
2. Add to the `GameStore` interface:
```ts
  watching: boolean;
```
and:
```ts
  setWatching: (v: boolean) => void;
```
3. Add initial state `watching: false,` near the other booleans.
4. Add action:
```ts
  setWatching: (watching) => set({ watching }),
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/gameStore.test.ts`
Expected: PASS.

- [x] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Then:
```bash
git add src/store/gameStore.ts tests/gameStore.test.ts
git commit -m "feat: add watching flag and watchingPrompt overlay to store"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/ru.ts`

**Interfaces:**
- Consumes: existing i18n key layout (alphabetical `'ui.*'` / `'gameover.*'` sections).
- Produces the following keys (English / Russian), added alphabetically near the existing `ui.*` and `gameover.*` keys:
  - `'watch.title'`: `'Game over'` / `'Конец игры'`
  - `'watch.body'`: `'You have been eliminated. Watch the remaining tribes fight, or finish now.'` / `'Вы выбыли. Наблюдайте за борьбой оставшихся племён или завершите игру.'`
  - `'watch.watch'`: `'Watch'` / `'Наблюдать'`
  - `'watch.finish'`: `'Finish'` / `'Завершить'`
  - `'watch.exit'`: `'Exit to main menu'` / `'В главное меню'`

- [x] **Step 1: Add English keys**

In `src/i18n/locales/en.ts`, add a `'watch.*'` group (e.g. after the `'ui.*'`/`'gameover.*'` entries as appropriate):

```ts
  'watch.title': 'Game over',
  'watch.body': 'You have been eliminated. Watch the remaining tribes fight, or finish now.',
  'watch.watch': 'Watch',
  'watch.finish': 'Finish',
  'watch.exit': 'Exit to main menu',
```

- [x] **Step 2: Add Russian keys**

In `src/i18n/locales/ru.ts`, add the same keys with the Russian values above.

- [x] **Step 3: Verify the i18n table stays balanced**

Run: `npm test`
Expected: PASS (the i18n test suite checks en/ru key parity).

- [x] **Step 4: Typecheck and commit**

Run: `npm run typecheck`
Then:
```bash
git add src/i18n/locales/en.ts src/i18n/locales/ru.ts
git commit -m "feat: add spectate prompt and exit i18n strings"
```

---

### Task 5: Controller — reveal, watch, finish, exit, autoplay loop, detection

**Files:**
- Modify: `src/controller/gameController.ts`
- Test: `tests/spectate.test.ts` (new file)

**Interfaces:**
- Consumes:
  - `shouldPromptWatch` from `../game/gameMode` (Task 2).
  - `useGameStore`, `confirmLeaveGame` from `../store/gameStore` (Task 3).
- Produces:
  - `private revealMapForLocal(): void` — marks every tile explored for the local player, adds all other tribes to `knownTribes`, then `syncStore()`, `saveGame()`, `render()`.
  - `watchGame(): void` — dismisses the prompt overlay, calls `revealMapForLocal()`, `store.setWatching(true)`, and starts the autoplay loop.
  - `finishGameNow(): void` — dismisses the prompt, calls `sim.endNow()`, `syncStore()`.
  - `exitWatching(): void` — `store.setWatching(false)` and `confirmLeaveGame()`.
  - `private watchingLoopRunning = false` and `private runWatchLoop(): Promise<void>` — while watching and not game over, `await this.runCommand({ type: 'endTurn' })` then a `SPECTATE_ROUND_DELAY_MS` delay; guarded against re-entry.
  - A module-level `const SPECTATE_ROUND_DELAY_MS = 500;`.
  - `runCommand` sets the `watchingPrompt` overlay when `shouldPromptWatch` is true.

- [x] **Step 1: Write the failing test**

Create `tests/spectate.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { Container } from 'pixi.js';
import { gameController } from '../src/controller/gameController';
import { useGameStore } from '../src/store/gameStore';
import { makeTestMap, tileAt } from './helpers/testMap';
import { buildPlayers } from '../src/game/players';
import { Tribe } from '../src/game/tribes';
import { SeededRandom } from '../src/util/random';
import { Simulator } from '../src/game/simulator';

const originalSim = (gameController as unknown as { sim: unknown }).sim;

afterEach(() => {
  (gameController as unknown as { sim: unknown }).sim = originalSim;
  useGameStore.getState().setWatching(false);
  useGameStore.getState().setOverlay(null);
});

describe('spectate reveal', () => {
  it('revealMapForLocal explores every tile and all tribes', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    players[0]!.knownTribes = [];
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ netMode: 'single', localPlayerIndex: 0 });
    gameController.revealMapForLocal();
    const anyTile = map.tiles.find((t) => !(t.exploredBy ?? []).includes(0))!;
    expect(anyTile).toBeUndefined();
    expect(players[0]!.knownTribes).toContain(players[1]!.tribe);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spectate.test.ts`
Expected: FAIL — `revealMapForLocal` is not a function.

- [x] **Step 3: Extract `revealMapForLocal` and refactor `cheatRemoveFog`**

In `src/controller/gameController.ts`, replace the body of `cheatRemoveFog` (which currently does the loop + tribes + sync) with a call to the new private method, and add:

```ts
  /** Reveal the whole map and every tribe for the local player. */
  private revealMapForLocal(): void {
    if (!this.sim) return;
    const store = useGameStore.getState();
    const local = this.sim.players[store.localPlayerIndex];
    if (!local) return;
    for (const tile of this.sim.map.tiles) {
      if (!(tile.exploredBy ?? []).includes(store.localPlayerIndex)) (tile.exploredBy ??= []).push(store.localPlayerIndex);
    }
    const tribes = this.sim.players.filter((p) => p.index !== local.index).map((p) => p.tribe);
    local.knownTribes = Array.from(new Set([...(local.knownTribes ?? []), ...tribes]));
    this.syncStore();
    this.saveGame();
    this.render();
  }
```

`cheatRemoveFog` becomes:

```ts
  cheatRemoveFog(): boolean {
    if (!this.sim) return false;
    const store = useGameStore.getState();
    if (store.screen !== 'game' || store.netMode !== 'single') return false;
    this.revealMapForLocal();
    return true;
  }
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/spectate.test.ts`
Expected: PASS.

- [x] **Step 5: Add the prompt detection in `runCommand`**

In `runCommand`, after `this.syncStore();` and before `this.render();`, insert:

```ts
      const storeNow = useGameStore.getState();
      if (this.sim && shouldPromptWatch({
        netMode: storeNow.netMode,
        mode: storeNow.mode,
        gameOver: storeNow.gameOver,
        watching: storeNow.watching,
        localActive: this.sim.players[storeNow.localPlayerIndex]?.isActive ?? true,
        overlayKind: storeNow.overlay?.kind ?? null,
      })) {
        storeNow.setOverlay({ kind: 'watchingPrompt' });
      }
```

Add the import: `import { shouldPromptWatch } from '../game/gameMode';` and update the existing `import { type GameMode } from '../game/gameMode';` line to also import `shouldPromptWatch`.

- [x] **Step 6: Add `watchGame`, `finishGameNow`, `exitWatching`, and the autoplay loop**

Add a module-level constant near the top of the file (after `VILLAGE_START_OFFSET`):

```ts
const SPECTATE_ROUND_DELAY_MS = 500;
```

Add a private field `private watchingLoopRunning = false;` to the class. Then add these methods (place them near `endTurn`):

```ts
  watchGame(): void {
    const store = useGameStore.getState();
    if (store.overlay?.kind === 'watchingPrompt') store.setOverlay(null);
    this.revealMapForLocal();
    store.setWatching(true);
    void this.runWatchLoop();
  }

  finishGameNow(): void {
    const store = useGameStore.getState();
    if (store.overlay?.kind === 'watchingPrompt') store.setOverlay(null);
    if (!this.sim) return;
    this.sim.endNow();
    this.syncStore();
  }

  exitWatching(): void {
    useGameStore.getState().setWatching(false);
    confirmLeaveGame();
  }

  private async runWatchLoop(): Promise<void> {
    if (this.watchingLoopRunning) return;
    this.watchingLoopRunning = true;
    try {
      while (useGameStore.getState().watching && this.sim && !this.sim.gameOver) {
        await this.runCommand({ type: 'endTurn' });
        await new Promise((resolve) => setTimeout(resolve, SPECTATE_ROUND_DELAY_MS));
      }
    } finally {
      this.watchingLoopRunning = false;
    }
  }
```

Update the store import to include `confirmLeaveGame`:
```ts
import { useGameStore, confirmLeaveGame } from '../store/gameStore';
```

- [x] **Step 7: Typecheck, run tests, commit**

Run: `npm run typecheck` and `npm test`
Then:
```bash
git add src/controller/gameController.ts tests/spectate.test.ts
git commit -m "feat: spectate watch/finish/exit flow and elimination prompt"
```

---

### Task 6: Watch prompt dialog + OverlayManager

**Files:**
- Create: `src/ui/overlays/WatchPromptDialog.ts`
- Modify: `src/ui/overlays/OverlayManager.ts`
- Test: `tests/spectate.test.ts` (append)

**Interfaces:**
- Consumes: `t` from `../../i18n`, `Popup`, `Button`, `makeLabel` from the kit, `gameController.watchGame`/`finishGameNow` (Task 5), `UIHost`.
- Produces: `class WatchPromptDialog` with `mount(host, root)`, `hide(onDone)`, `destroy()`.

- [x] **Step 1: Write the failing test**

Append to `tests/spectate.test.ts`:

```ts
import { WatchPromptDialog } from '../src/ui/overlays/WatchPromptDialog';
import { Text } from 'pixi.js';

describe('WatchPromptDialog', () => {
  it('shows Watch and Finish buttons', () => {
    const map = makeTestMap(3);
    const players = buildPlayers(Tribe.Villagers, 2, new SeededRandom(1));
    const sim = new Simulator(map, players, 'capture', { rng: () => 0.5 });
    (gameController as unknown as { sim: unknown }).sim = sim;
    useGameStore.setState({ screen: 'game', players, localPlayerIndex: 0, mode: 'capture' });
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    const host = { app: { screen: { width: 1280, height: 800 } }, overlayLayer: new Container() } as unknown as import('../src/ui/host').UIHost;
    const root = new Container();
    const d = new WatchPromptDialog();
    d.mount(host, root);
    const texts: string[] = [];
    const walk = (c: Container): void => { for (const ch of c.children) { if (ch instanceof Text) texts.push(String((ch as Text).text)); if (ch instanceof Container) walk(ch as Container); } };
    walk(root);
    d.destroy();
    expect(texts.some((t) => t.includes('WATCH'))).toBe(true);
    expect(texts.some((t) => t.includes('FINISH'))).toBe(true);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/spectate.test.ts -t 'WatchPromptDialog'`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `WatchPromptDialog`**

Create `src/ui/overlays/WatchPromptDialog.ts`:

```ts
import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class WatchPromptDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const watch = new Button({ label: t('watch.watch'), width: 180, onClick: () => gameController.watchGame() });
    const finish = new Button({ label: t('watch.finish'), width: 180, onClick: () => gameController.finishGameNow() });
    const popup = new Popup({
      app: host.app,
      title: t('watch.title'),
      buttons: [watch, finish],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });

    const hint = makeLabel(t('watch.body'), {
      fontSize: 14,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    hint.position.set(0, 0);
    popup.content.addChild(hint);

    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    popup.finish();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.popup?.destroy();
    this.popup = null;
    this.el = null;
    this.host = null;
  }
}
```

- [x] **Step 4: Register in `OverlayManager`**

In `src/ui/overlays/OverlayManager.ts`:
1. Add import: `import { WatchPromptDialog } from './WatchPromptDialog';`
2. Add to `entries`:
```ts
    watchingprompt: { make: () => new WatchPromptDialog(), mounted: null, hiding: false },
```
3. In `active()`, inside the `switch (s.overlay?.kind)` block add:
```ts
        case 'watchingPrompt':
          active.add('watchingprompt');
          break;
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/spectate.test.ts`
Expected: PASS.

- [x] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Then:
```bash
git add src/ui/overlays/WatchPromptDialog.ts src/ui/overlays/OverlayManager.ts tests/spectate.test.ts
git commit -m "feat: Watch or finish prompt dialog"
```

---

### Task 7: "Exit to main menu" HUD button

**Files:**
- Create: `src/ui/hud/HudWatchExit.ts`
- Modify: `src/ui/screens/GameScreen.ts`
- Test: `tests/hudTurn.test.ts` (or a new `tests/hudWatchExit.test.ts`)

**Interfaces:**
- Consumes: `t` from `../../i18n`, `useGameStore`, `gameController.exitWatching` (Task 5), `Button` from `../kit/button`, `UIHost`/`Widget`, layout constants `TOOLBAR_HEIGHT`, `TURN_BAR_HEIGHT`, `TURN_BAR_GAP`, `isWideScreen`.
- Produces: `class HudWatchExit implements Widget` with `mount(host, root)`, `destroy()`.

- [x] **Step 1: Write the failing test**

Create `tests/hudWatchExit.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { Container, Text } from 'pixi.js';
import { HudWatchExit } from '../src/ui/hud/HudWatchExit';
import { useGameStore } from '../src/store/gameStore';
import { type UIHost } from '../src/ui/host';

function makeHost(): UIHost {
  return { app: { screen: { width: 1280, height: 800 } }, overlayLayer: new Container() } as unknown as UIHost;
}

describe('HudWatchExit', () => {
  it('is visible only while watching and not game over', () => {
    Object.defineProperty(Text.prototype, 'width', { configurable: true, get: () => 60 });
    Object.defineProperty(Text.prototype, 'height', { configurable: true, get: () => 14 });
    (globalThis as { CanvasRenderingContext2D?: unknown }).CanvasRenderingContext2D = class {};
    const host = makeHost();
    const root = new Container();
    const w = new HudWatchExit();
    w.mount(host, root);
    useGameStore.setState({ screen: 'game', watching: false, gameOver: false });
    expect(w.elVisible()).toBe(false);
    useGameStore.setState({ watching: true, gameOver: false });
    expect(w.elVisible()).toBe(true);
    useGameStore.setState({ watching: true, gameOver: true });
    expect(w.elVisible()).toBe(false);
    w.destroy();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/hudWatchExit.test.ts`
Expected: FAIL — module not found / `elVisible` missing.

- [x] **Step 3: Implement `HudWatchExit`**

Create `src/ui/hud/HudWatchExit.ts`:

```ts
import { Container } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT, TURN_BAR_GAP, isWideScreen } from '../layout';

export class HudWatchExit implements Widget {
  private el: Container | null = null;
  private btn: Button | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const btn = new Button({ label: t('watch.exit'), onClick: () => gameController.exitWatching() });
    const el = new Container();
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.btn = btn;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  elVisible(): boolean {
    const s = useGameStore.getState();
    return s.screen === 'game' && s.watching && !s.gameOver;
  }

  private update(): void {
    if (this.el) this.el.visible = this.elVisible();
  }

  private layout = (): void => {
    if (!this.el || !this.btn || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    const wide = isWideScreen(screenW);
    const barW = wide ? Math.min(screenW, 600) : screenW;
    this.el.position.set(
      (screenW - barW) / 2 + barW / 2 - this.btn.width / 2,
      screenH - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - this.btn.height,
    );
  };

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.btn = null;
    this.host = null;
  }
}
```

- [x] **Step 4: Register in `GameScreen`**

In `src/ui/screens/GameScreen.ts`:
1. Add import: `import { HudWatchExit } from '../hud/HudWatchExit';`
2. Add `new HudWatchExit()` to the `gameWidgets` array (e.g., after `HudTurn`).

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/hudWatchExit.test.ts`
Expected: PASS.

- [x] **Step 6: Typecheck and commit**

Run: `npm run typecheck` and `npm test`
Then:
```bash
git add src/ui/hud/HudWatchExit.ts src/ui/screens/GameScreen.ts tests/hudWatchExit.test.ts
git commit -m "feat: exit-to-main-menu button while spectating"
```

---

### Task 8: Full regression gate

**Files:**
- No source changes unless a regression appears.

- [x] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `spectate.test.ts`, `hudWatchExit.test.ts`, `simulatorTurn.test.ts`, `gameMode.test.ts`, and `gameStore.test.ts` tests.

- [x] **Step 2: Run the typecheck**

Run: `npm run typecheck`
Expected: no type errors.

- [x] **Step 3: Manual smoke check**

Run: `npm run dev`, start a single-player capture game vs 2 AIs, and verify:
1. When the player's last village is captured with AIs remaining, the **Watch or finish?** dialog appears.
2. **Watch** reveals the whole map, AI turns animate automatically, and Game Over appears once an AI wins.
3. The **"Exit to main menu"** button is visible above the turn bar while watching and clicking it returns to the main menu.
4. **Finish** immediately shows the Game Over screen with final standings.

- [x] **Step 4: Commit any fixes**

If the smoke test reveals issues, fix them, re-run `npm test` + `npm run typecheck`, and commit.
