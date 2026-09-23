# Selection Animation, Upgrade Cost, and Single-Player Save Design

Date: 2026-08-25

## Problem

Three items:

1. The selected-unit bounce moves down and is too slow; it should be faster and
   move up from base and back.
2. The "Upgrade village" toolbar action does not show its cost.
3. Single-player games cannot be saved and resumed.

## Section 1 — Bounce tweak

`src/render/mapRenderer.ts`, `updateSelectedBounce`:

- Duration `600` → `300` ms (×2 faster).
- Flip the sign so the sprite moves **up** from its base and back:
  `position.y = baseY − sin(π·t)·amp` (currently `+amp` moves it down, since
  screen Y increases downward).

## Section 2 — Upgrade village cost label

`src/ui/hud/toolbarSpecs.ts`: the `upgrade` action label becomes
`Upgrade village (2w, 1s, 2m)`, built from `UPGRADE_COST` so it stays accurate if
costs change.

## Section 3 — Storage abstraction (new `src/storage/`)

- `src/storage/storageService.ts`:

  ```ts
  export interface StorageService {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  }
  ```

  plus `class LocalStorageService implements StorageService` wrapping
  `window.localStorage`, and a default `storageService` instance. This is the
  swap point for a future backend (IndexedDB, remote, etc.).

- `src/storage/saveGame.ts`:

  ```ts
  export interface SaveRepository {
    save(snapshot: GameStateSnapshot): void;
    load(): GameStateSnapshot | null;
    hasSave(): boolean;
    clear(): void;
  }
  export function createSaveRepository(storage: StorageService): SaveRepository;
  export const saveRepository: SaveRepository;
  ```

  Serializes `GameStateSnapshot` to JSON under key `hex-save-v1`. `load()`
  returns `null` on missing/corrupt data. The factory makes the logic
  unit-testable with a fake in-memory storage.

## Section 4 — Auto-save hooks (`src/controller/gameController.ts`)

- Save at the start of each of your turns: in `presentTurnStarted`, when
  `playerIndex === store.localPlayerIndex` and `store.netMode === 'single'`,
  call `this.saveGame()`.
- New method `saveGame()`: `saveRepository.save(this.sim.snapshot())`.
- Also save once at the end of `startGame` (single-player) — the initial
  `turnStarted` event is drained there and would otherwise never trigger a save.
- Clear on game over: in `presentGameOver`, `saveRepository.clear()`.
- Multiplayer games never save (guarded by `netMode === 'single'`).

Because `turnStarted` fires only on human turns (AI runs synchronously inside
`doEndTurn`), every save captures a clean state where it is the local player's
turn with `aiActive === false`.

## Section 5 — Resume button on the start screen

- `src/ui/screens/StartScreen.ts`: on `mount`, check `saveRepository.hasSave()`.
  If a save exists, add a **Resume** button as the first menu option (index 0;
  keyboard nav cycles Resume → Single player → Multiplayer).
- `gameController.resumeGame()`: read `saveRepository.load()`, rebuild the
  simulator via `Simulator.fromSnapshot`, restore store state (players, mode,
  turn, currentPlayerIndex, gameOver/winner/bonus, expectedTurns), set
  `netMode 'single'`, `localPlayerIndex 0`, `aiActive` per the saved turn, clear
  selection, and `setScreen('game')`. The game screen mounts and renders the
  restored map (textures are created in `gameController.init`, which already
  handles an existing sim).
- Button positions are computed dynamically so 2 or 3 menu items stay centered
  under the title; the hint line moves below the last button.

## Files touched

- Modify: `src/render/mapRenderer.ts`, `src/ui/hud/toolbarSpecs.ts`,
  `src/controller/gameController.ts`, `src/ui/screens/StartScreen.ts`.
- Create: `src/storage/storageService.ts`, `src/storage/saveGame.ts`,
  `tests/storage.test.ts`.

## Testing

- New `tests/storage.test.ts` using a fake in-memory `StorageService`:
  save→load round-trip, `hasSave()` true/false, `clear()`, corrupt JSON →
  `load()` returns null.
- `npm run typecheck` and `npm test` must pass.
- Manual (`npm run dev`): play a single-player turn → save exists; return to the
  start screen → **Resume** appears; Resume restores the exact board (turn,
  resources, unit positions); finish a game → save cleared and Resume gone.
