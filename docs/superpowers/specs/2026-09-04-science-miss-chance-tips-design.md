# Science Miss Chance and In-Game Tips

## Overview

Three additions: (1) the **Science** skill lowers the owner's attack miss chance from the
base 10% to 5%; (2) an in-game **tips** system shows short onboarding hints near the Skills
button, one at a time, starting on turn 3 and every 2 turns after a tip is closed, in a random
order per game; (3) a persistent **"Disable tips"** setting (default off) in the main-menu
Settings modal.

## Changes

### 1. Miss chance and Science (`src/game/combat.ts`, `src/game/skills.ts`, `src/game/simulator.ts`)

- `combat.ts` keeps `MISS_CHANCE = 0.1` and adds `SCIENCE_MISS_CHANCE = 0.05`.
- New exported `missChanceFor(player: Player): number` — returns `SCIENCE_MISS_CHANCE` when
  `hasSkill(player, 'science')`, otherwise `MISS_CHANCE`. Applies to any attacker owned by that
  player, including ships; pirates (owner −1, no player) keep 10%.
- `performAttack(map, attacker, target, rng = Math.random, missChance = MISS_CHANCE)` — the miss
  check becomes `if (rng() < missChance)`. Existing callers that pass an rng as the 4th argument
  are unaffected.
- `simulator.doAttack` passes `missChanceFor(this.players[attacker.owner]!)`; `pirateAttack`
  stays on the default (10%). No other `performAttack` call sites exist.
- `SKILLS.science.description` becomes
  `"Allows advanced research. Cuts your attack miss chance to 5%."`
- Docs: `GAME.md` Unit actions bullet and the Science row of the Skills table mention the 10%→5%
  Science effect.

### 2. "Disable tips" setting (`src/storage/settings.ts`, `src/ui/screens/StartScreen.ts`)

- `GameSettings` gains `disableTips: boolean` (default `false`). `loadSettings` merges the
  defaults, so existing saved settings without the key default to `false`.
- New helpers `tipsDisabled(): boolean` and `setTipsDisabled(enabled: boolean)`.
- The main-menu `SettingsPanel` (Start screen) adds a "Disable tips" row with a checkbox,
  matching the existing "Attack confirmation dialog" row style. The card grows and the rows
  below (AI difficulty, Close) shift down accordingly.
- When checked, no tips are shown in games started afterwards (in-memory per game, so toggling
  only affects games loaded after the toggle).

### 3. Tips system (`src/ui/hud/HudTips.ts`, `src/ui/hud/tips.ts`, `src/ui/hud/HudSkills.ts`, `src/ui/layout.ts`, `src/ui/screens/GameScreen.ts`)

**Content** — five tips, shown one at a time, each once per game, in a per-game random order:

1. "Attacks can miss. Open the Science skill to make your attacks more precise."
2. "Open the Roads skill to connect villages and move your units faster."
3. "Open the Navigation skill to turn units into ships and sail the seas."
4. "Beware: pirates can capture your ships."
5. "Build mines on mountains to gather stone and ore — you need them to upgrade villages."

**Pure model** (`src/ui/hud/tips.ts`) — keeps scheduling testable without Pixi:

- `TIP_TEXTS: string[]` — the five strings above.
- `TipsProgress` — `{ order: number[]; pointer: number; closedAtTurn: number | null }`.
- `initialTipsProgress(rng: () => number): TipsProgress` — shuffles `[0..4]` with the given rng.
- `tipsDueTurn(progress): number` — `closedAtTurn === null ? 3 : closedAtTurn + 2`.
- `isTipsExhausted(progress): boolean` — `pointer >= order.length`.

**Widget** (`HudTips`) — a Pixi widget mounted in `GameScreen` after `HudSkills`:

- Renders a small black rounded container with small white text and a white ✕ on the right;
  closing is the only way to advance the sequence.
- Positioned just left of the Skills button and vertically centered with it. The Skills button
  anchor moves into a shared helper in `src/ui/layout.ts` (e.g. `skillsButtonPosition(screenW,
  screenH)`), reused by `HudSkills` so both stay in sync.
- Subscribes to `useGameStore`; on every store update it shows/hides according to:
  - not `tipsDisabled()`, `screen === 'game'`, not `gameOver`, not `texturesLoading`,
    `players.length > localPlayerIndex`, and `currentPlayerIndex === localPlayerIndex`
    (only during the local player's own turn),
  - an unclosed tip is remembered and re-shown at the start of later own turns until closed.
- Showing a new tip: if a tip is not currently pending and the current game turn is at least
  `tipsDueTurn(progress)`, show the next unshown tip (in random order). Closing sets
  `closedAtTurn = current turn`, advances `pointer`, and hides the box.
- Per-game state lives in the widget instance and resets on each entry to the game screen
  (a fresh `GameScreen` mount, e.g. new game or resume).

### 4. Anchor sharing (`src/ui/layout.ts`, `src/ui/hud/HudSkills.ts`)

- `layout.ts` exposes `skillsButtonPosition(screenW: number, screenH: number)` returning the
  top-left of the Skills button, derived from the existing constants
  (`TOOLBAR_SIDE_PADDING = 12`, `SKILLS_BUTTON_SIZE = 48`, `TURN_BAR_GAP = 6`).
- `HudSkills.layout` uses it (behavior unchanged); `HudTips` uses it to anchor its box to the
  left of the button.

## Tests

- `tests/combat.test.ts`:
  - `missChanceFor(player)` returns `0.05` with Science and `0.1` without.
  - `performAttack` honours an explicit miss chance: roll `0.04` with miss chance `0.05` misses,
    roll `0.08` hits.
- `tests/simulator.test.ts` (or `simulatorTurn.test.ts`): at a fixed rng roll of `0.08` (between
  the two thresholds) a normal player's attack misses while a Science-owning player's attack hits.
- `tests/skills.test.ts`: `SKILLS.science.description` mentions the 5% miss-chance effect.
- `tests/settings.test.ts`: `disableTips` defaults to `false` and round-trips via
  `setTipsDisabled`.
- `tests/tips.test.ts` (new): `initialTipsProgress` uses the rng; `tipsDueTurn` is `3` initially
  then `closedAtTurn + 2`; exhausted after all five are closed; `TIP_TEXTS` has the five strings.
- `tests/hudTips.test.ts` (new): no tip at turn 1; a tip appears on the local player's own turn
  once the turn reaches 3; closing it hides the box and records the turn; the next tip appears no
  earlier than two turns after the close, on an own turn; tips stay hidden during other players'
  turns and when `disableTips` is on.
- `tests/startScreen.test.ts` keeps passing (no internals asserted; the Settings panel gains a
  row).

## Out of scope

- No change to counter-attack accuracy (counter-attacks never miss, as today).
- No in-game Settings access; "Disable tips" lives only in the main-menu Settings modal.
- Tips are not persisted per game (save/resume starts the sequence again) and are not synced
  over the network; each local player sees their own tips.
- No change to pirate miss chance or AI behavior beyond Science applying through the shared
  attack path.
