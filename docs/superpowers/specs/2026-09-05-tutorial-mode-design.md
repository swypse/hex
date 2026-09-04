# Tutorial Mode — Design

Date: 2026-09-05

Status: Approved (in brainstorming) — pending implementation plan

## Summary

Add a scripted **tutorial mode** to the hex strategy game, reachable via a **Tutorial** button on the start screen. It teaches the core loop — select & move a unit, upgrade a village, collect income, research skills, build a sawmill and a mine, spawn an archer, and attack — using a **fixed, code-authored map** and a step-by-step director that advances the player through numbered objectives. Play is permissive (the player may do anything a normal game allows); each step auto-completes when its objective is observed.

## Decisions (agreed in brainstorming)

- **Economy:** the tutorial grants generous starting resources (~70 money, 20 wood, 20 stone, 5 ore) so no step requires grinding end-turns for income. The two required "End your turn" presses still visibly add income.
- **Message style:** objective instructions are a **persistent, non-blocking banner** on the map area. Only the opening **welcome** message and the closing **end** message are dialogs (welcome closable; end has a Return-to-menu button). Objective banners cannot be dismissed by the player — they advance automatically.
- **Attention markers:** besides skill-tree and End Turn highlighting, each objective step shows a **gold pulsing ring** over the relevant hex(es).
- **Strictness:** permissive. Any normal action is allowed at any time; steps advance on their own objective, and a step that is already satisfied on entry is skipped immediately (no soft-locks).

## Architecture overview

Tutorial mode is a thin layer on top of the existing single-player engine. **No rule-engine changes are required.**

- A tutorial game is a normal `Simulator` run in `turns30` mode with **two players**:
  - Player 0 = the human, active, owns the capital village on the tutorial map.
  - Player 1 = an inactive "Warriors" dummy that owns **no villages** and exists only so the scripted enemy Warrior at the end has a valid `owner` index for rendering and combat. Because `Player.isActive === false`, the stock `Simulator.doEndTurn` already skips the dummy while still performing the round wrap — so **End Turn collects income, increments the turn counter, resets unit flags, and returns to the human with no AI ever running**.
  - No game-over can occur: `turns30` ends only at turn 30 and the tutorial finishes long before; the all-land map has no water, so pirates never spawn; the dummy has no capturable settlements.
- New modules:
  - `src/game/tutorial/tutorialMap.ts` — fixed map + players + helpers.
  - `src/game/tutorial/tutorialSteps.ts` — step definitions, messages, marker targets, completion predicates, per-step highlight data (pure data + predicates).
  - `src/controller/tutorialDirector.ts` — the step state machine (modeled on `EventPresenter`, receiving its dependencies via a host interface).
- Store additions:
  - `tutorial: boolean`
  - `tutorialStep: TutorialStepId | null`
  - `tutorialHighlightSkills: SkillId[]` (empty when none)
  - `tutorialHighlightEndTurn: boolean`
  - The step id alone is enough for HudSkills/HudToolbar/MapView to derive their other highlight states via the shared `stepConfig` table.
- `GameController` integration:
  - `startTutorial()` builds the tutorial map/players/sim, hydrates the store (`tutorial=true`, `tutorialStep='welcome'`, mode `turns30`), sets `screen='game'`, and lets `GameScreen.init` run texture creation so the existing "Loading…" screen shows; camera centers on the capital.
  - `runCommand()` calls `director.onEvents(events)` after events are presented and rendered (only when `tutorial`), then re-renders if the director changed state.
  - `saveGame()` returns early when `tutorial` is true. Existing saves of real games are left untouched; a tutorial never creates a Resume entry.

## Fixed tutorial map

`src/game/tutorial/tutorialMap.ts` exports `buildTutorialMap(): GameMap` and `buildTutorialPlayers(): Player[]`.

A hand-authored hex disc of **radius 4**, all grassland land tiles with no water, every tile explored by player 0 (no fog). Special tiles (axial coordinates; distance 1 = adjacent):

| Tile      | Content |
|-----------|---------|
| `(0,0)`   | Player's capital village (level 1) with a starting **Warrior** standing on it |
| `(1,-1)`  | open land the Warrior moves to in the first objective (stays parked here) |
| `(-1,1)`  | **Forest** (feeds the sawmill) |
| `(0,1)`   | open owned land → **sawmill** build target (adjacent to the forest) |
| `(2,-2)`  | **Mountain** → **mine** build target (inside the level-2 claim) |
| `(1,0)`   | open land between village and enemy — the Archer's firing spot |
| `(2,1)`   | empty land, distance 3 from `(0,0)` — where the scripted enemy Warrior appears |

Details:

- The map is produced by filling a radius-4 disc with default grassland tiles, then applying the special tiles above and giving the land `biome: Biome.Grassland` and a default height so rendering/textures work.
- Village claims (`ownedBy`, `claimedByVillage`) are set with the normal claim pass (`claimTileForVillage` / the same logic `mapGen` uses) so territory renders and building-placement rules behave.
- The starting Warrior is created with `makeUnit(...)` and `spawnVillage` pointing at `(0,0)`; the map tile holds it.
- `spawns` array includes entries for both player indices (index 1 points at a harmless far tile) to satisfy any code that reads `map.spawns[i]`.
- Player 0: fixed tribe (no start skill applied), `skills: []`, `resources` = generous starting stash above, `isHuman: true`, `isActive: true`.
- Player 1: dummy tribe `Warriors`, `isHuman: false`, `isActive: false`, owns nothing.
- All tiles have `exploredBy` containing 0 so everything is visible and attackable without fog complications.

## Step sequence

State machine ids, ordered. Each objective step has a **completion predicate over sim state** plus, where noted, an event observation. After every local command the director re-checks the current step's predicate; a step whose predicate is already true on entry is skipped immediately.

| Id | Banner/dialog instruction | Completes when |
|----|---------------------------|----------------|
| `welcome` | Closable dialog: "Welcome to the Hex demo. This tutorial teaches you the basics: move a unit, upgrade your village, collect income each turn, research skills, build a sawmill and a mine, spawn an archer, and fight an enemy. Follow each instruction; your objective is shown at the top of the screen." | Player closes it (outside click / Escape / Close) |
| `moveUnit` | "Select your Warrior and click a highlighted tile to move it to a new hex." | Local player's starting Warrior has left `(0,0)` (its first `unitMoved`) |
| `upgradeVillage` | "Upgrade your village by selecting it and pressing Upgrade (2 wood + 1 stone + 2 money). Each level raises its income, territory and unit capacity." | The capital village reached level ≥ 2 (`villageUpgraded` at `(0,0)`) |
| `openForestry` | "You need wood to build. Open the skill tree (skills button, bottom right) and open the Forestry skill — it lets you build sawmills next to forests." | Player 0 `hasSkill forestry` (`skillOpened`) |
| `endTurn1` | "You are done with this turn. Press the highlighted End Turn button." | Next `turnStarted` for the human (End Turn pressed, round wrapped) |
| `endTurn2` | "Money is collected each turn: every village pays 3 + its level, minus 1 per unit above its capacity. Your upgraded village just earned you money. Press End Turn again." | Following `turnStarted` for the human |
| `buildSawmill` | "Select the highlighted tile beside the forest and press Build sawmill (10 money). Sawmills produce +1 wood per adjacent forest each turn." | A `sawmill` building owned by player 0 exists at `(0,1)` |
| `openClimbingSmithery` | "You will need stone and ore for stronger units and mines. Open the skill tree and research Climbing, then its child Smithery (both highlighted)." | Player 0 `hasSkill climbing` **and** `hasSkill smithery` |
| `buildMine` | "Select the highlighted mountain and press Build mine (15 money). Mines produce 1 stone and 1 ore each turn." | A `mine` building owned by player 0 exists at `(2,-2)` |
| `spawnArcher` | "Select your village and press Spawn, then choose the Archer (6 money). Archers attack from up to 2 hexes away." | An `archer` unit owned by player 0 exists with `spawnVillage` at `(0,0)` |
| `attackEnemy` | On entry the director **places** the enemy Warrior at `(2,1)` (distance 3 from the Archer at the village). "An enemy Warrior appeared. Move your Archer within range and attack it — archers strike from up to 2 hexes. It will not move." | The local Archer attacks the dummy Warrior (`attack` event, hit or miss) |
| `end` | On entry the director **removes** the enemy. Dialog: "Basic tutorial complete. You know how to move, build, research and fight — good luck in the real game!" + **Return to main menu** button. | Player clicks the button (exits to start screen, clears `tutorial`/step flags) |

Notes:

- The Archer spawns on the capital tile and is freshly-spawned, so it cannot act until the next turn — the enemy appears immediately and the `attackEnemy` banner persists across the required End Turn, matching "the enemy does not move".
- **Enemy placement is robust to permissive play:** the director places the enemy Warrior on the *first empty, explored land tile at exactly distance 3 from the Archer's hex* (preferring `(2,1)`), falling back to the next such tile if the player has parked a unit there. The step marker for `attackEnemy` is then derived from the actual placed tile, so the pulse is always correct.
- Objective markers for the banner steps: `moveUnit` → `(0,0)`; `upgradeVillage` → `(0,0)`; `buildSawmill` → `(0,1)` (+ optionally the forest `(-1,1)`); `buildMine` → `(2,-2)`; `spawnArcher` → `(0,0)`; `attackEnemy` → `(2,1)` (+ the Archer).
- Skill-tree highlights: `openForestry` → `[forestry]`; `openClimbingSmithery` → `[climbing, smithery]`. The skills button is pulsed for both.
- End Turn button is pulsed for `endTurn1` and `endTurn2`.

## Controller/director wiring

- `GameController` owns a lazily-created `TutorialDirector` and constructs it with a host interface exposing: `sim()`, `render()`, `syncStore()`, `store setters`, `bringCellIntoView(q,r)`, `enqueue(task)`, `placeEnemyWarrior()`, `removeEnemyWarrior()`, `exitTutorial()`.
- `startTutorial()`:
  1. Build map + players; `this.sim = new Simulator(map, players, 'turns30')`; `sim.startGame()`; `sim.drainEvents()`.
  2. Hydrate store exactly as `startGame()` does, plus `tutorial: true`, `tutorialStep: 'welcome'`, and mode `turns30`; do **not** set the normal `welcome` overlay.
  3. Pre-select the starting unit at `(0,0)`; set `screen='game'`.
  4. Textures/loading/center-on-start flow via the existing `GameScreen.init` path (mirroring `resumeGame`, with `startVillageIntroPending`).
- `runCommand()` — after `await this.presentEvents(...); this.render();`, when `useGameStore.getState().tutorial`:
  - `await this.director.onEvents(events)` then `this.render()` again if the director reports a change.
- `saveGame()` returns early when `useGameStore.getState().tutorial`.
- `exitTutorial()` clears `tutorial`, `tutorialStep`, and highlight store fields, then `setScreen('start')`. (Also invoked from the normal leave-dialog path harmlessly: the store fields simply become inactive once `screen !== 'game'`.)

## UI

### Tutorial button on the start screen (`StartScreen.ts`)

Add a **Tutorial** button to the `buttons` array (order when a save exists: Resume, Single player, Multiplayer, Tutorial). It calls `gameController.startTutorial()`. Keyboard nav (`↑/↓`/`Enter`) continues to work because the button is part of the existing `buttons` list.

### Tutorial overlay (`OverlayManager` + new `TutorialOverlay`)

- New overlay entry `tutorial`, active when `screen === 'game' && store.tutorial`. It is added to `OverlayManager.entries` but **not** to the `OverlayState` union (it is driven by the `tutorial` flag, not by user-set overlay state).
- `TutorialOverlay` subscribes to the store and renders based on `tutorialStep` + `texturesLoading` (renders nothing until textures are ready):
  - `welcome`: a closable dialog (`Dialog`-based card with title, text lines, Close button; outside-click/Escape close too). Closing calls `gameController` → director advances to `moveUnit`.
  - `end`: a dialog with a **Return to main menu** button that calls `exitTutorial()`.
  - All other steps: a **top-center banner** (semi-transparent rounded panel) with the current instruction text. Non-interactive, non-blocking; may sit visually below any open modal overlay (e.g. the skill tree) without harm.

### Highlights

- **End Turn button** (`HudToolbar.ts`): while `tutorialHighlightEndTurn` is true, render a gold pulsing ring around the End Turn icon button (reuse an approach like the selection border pulse). Clear when the store flag clears.
- **Skills button** (`HudSkills.ts`): pulse the circular skills button while the active step is `openForestry` or `openClimbingSmithery` (derived from `tutorialStep`).
- **Skill-tree nodes** (`SkillTree.ts`): while `tutorialHighlightSkills` is non-empty, draw a pulsing ring / glow around each listed node. The SkillTree already rebuilds on every store change, so it reflects highlight updates automatically.
- **On-map markers** (`mapRenderer.ts`): `MapView.update` gains an additional set of tutorial marker keys (gold pulsing rings, animated like the existing selection pulse). `GameController.render()` computes this set from the active step via the shared step config and passes it through. When the tutorial is inactive the set is empty (zero effect on normal games).

### Cosmetic

- `HudTurn` shows a "Tutorial" label (instead of the `30 Turns` mode label) while `store.tutorial` is true.

## Robustness / edge cases

- **Soft-lock prevention:** every objective step's completion is a predicate over sim state; the director re-evaluates after each local command and skips any step already satisfied on entry. Examples handled automatically: opening Forestry before upgrading; upgrading twice; ending the turn early; moving the Warrior back to `(0,0)`; building the sawmill before the second End Turn.
- **Enemy never moves:** the dummy player is inactive, so no AI turn ever plans/moves it; round wraps only reset its flags.
- **Accidental game over:** impossible before turn 30 (`turns30`), and the tutorial always exits first.
- **Leaving mid-tutorial** via browser back still shows the existing leave dialog; on leaving, `screen !== 'game'` deactivates all tutorial UI and no save exists, so the start screen is clean (no Resume entry for the tutorial).
- **Permissive extras** (extra builds, extra moves, opening extra skills, etc.) are harmless; only the step's predicate matters.

## Testing

Unit tests (Vitest) — mirror existing patterns that drive a real `Simulator` over a fixture map:

1. `tutorialMap.test.ts`:
   - Tiles are a unique, valid radius-4 disc with the expected special terrains/settlements/units at the documented coordinates.
   - Village claims are consistent (capital owned by 0; claim radius respected; no water tiles).
   - Players have expected `isHuman`/`isActive`/skills/resources.
   - No water → `trySpawnPirate` never spawns.
2. `tutorialSteps.test.ts`:
   - Step list is complete and ordered `welcome` → `end`.
   - Each step's marker/`highlightSkills` targets exist on the tutorial map.
   - Completion predicates for `upgradeVillage`, `openForestry`, `buildSawmill`, `openClimbingSmithery`, `buildMine`, `spawnArcher` are satisfiable and become true exactly when their command is applied.
3. `tutorialDirector.test.ts` (integration): drive the real `Simulator` on the tutorial map through the whole sequence with a real `TutorialDirector` instance (no UI): move the Warrior → upgrade the village → open Forestry → End Turn ×2 → build sawmill → open Climbing + Smithery → build mine → spawn Archer → (director places the enemy) → move the Archer adjacent → attack. Assert the director reaches `end`, the enemy was removed, and highlight store fields cleared.

Manual checklist:

- Start screen shows Tutorial; clicking it shows Loading → map → closable welcome dialog → objective banner in order.
- Highlights appear/clear exactly on their steps (End Turn, skills button, skill nodes, hex markers).
- Two End Turns add village income visibly; building the sawmill/mine works at highlighted spots.
- Enemy appears at distance 3 from the Archer, never moves through End Turns, and disappears after the Archer attacks.
- Return to main menu returns to a clean start screen; no "Resume" entry appears for a tutorial; a pre-existing normal-game save is unaffected.
