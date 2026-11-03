# Design: Score system

Date: 2026-08-18

## Goal

Add a score system: players start with 0, their current score reflects board assets (villages/units/buildings) plus one-time action bonuses (upgrade/kill/capture). Show a gold score circle in the top-left corner with a big number, add scores to the top-left players list (sorted desc), and animate a flying "+N" from the action hex toward the score circle.

## Design decisions (confirmed with user)

1. **Displayed score = live board count + stored action bonuses** (Interpretation A). Board contributions are recomputed each render, so capturing/losing villages, building/killing units, and buildings all update the score automatically.
2. Board values: village 50, warrior 5, rider 6, archer 6, factory/mine 15.
3. Action bonuses (stored): upgrade village +40, kill enemy +10, capture village +50.
4. The gold circle shows the **current player's** total score (consistent with `MoneyInfo`, which shows `players[currentPlayerIndex]`).
5. The players list is sorted by total score descending and shows each player's score.
6. Flying "+N" appears above the hex where the action happened and flies toward the score circle at the top-left corner, fading out.

## Data model

### `src/game/score.ts` (new, pure)

```ts
export const VILLAGE_SCORE = 50;
export const WARRIOR_SCORE = 5;
export const RIDER_SCORE = 6;
export const ARCHER_SCORE = 6;
export const BUILDING_SCORE = 15;
export const UPGRADE_SCORE = 40;
export const KILL_SCORE = 10;
export const CAPTURE_SCORE = 50;

boardScore(map: GameMap, playerIndex: number): number
awardScore(player: Player, amount: number): void
totalScore(map: GameMap, player: Player): number
```

- `boardScore`: Σ over tiles with `ownedBy === playerIndex`: `settlement ? 50 : 0`, `unit` by type (5/6/6), `building ? 15 : 0`.
- `awardScore`: `player.score += amount`.
- `totalScore`: `player.score + boardScore(map, player.index)`.

### `src/game/players.ts`

- `Player` gains `score: number`. `buildPlayers` initializes it to `0`.

## Score awards (in `gameController`, human and AI alike)

- **Upgrade village** — in `upgradeSelectedVillage` and the AI `upgrade` action handler: `awardScore(player, UPGRADE_SCORE)`, then `spawnScoreFly(villageTile, UPGRADE_SCORE)`.
- **Kill enemy** — in `confirmAttack` and the AI `attack` handler, after `performAttack`: if `result.targetDied`, award `KILL_SCORE` to the attacker's player and fly it at the target hex; if `result.attackerDied`, award `KILL_SCORE` to the target's player and fly it at the attacker hex.
- **Capture village** — in `captureSelectedVillage` and the AI `capture` handler: `awardScore(capturer, CAPTURE_SCORE)` and `spawnScoreFly(villageTile, CAPTURE_SCORE)`.
- After any award, the players array is persisted with `store.setPlayers([...players])` so the HUD updates.

## Flying "+N" animation

- `gameController.spawnScoreFly(tile: MapTile, amount: number): void`:
  - Screen position of the hex: `pan.x + hexToPixel(tile).x * scale`, `pan.y + hexToPixel(tile).y * scale`, with `scale = baseScale * zoom`.
  - Creates a `Text('+' + amount)` (gold fill, dark stroke, fontSize ~24) on `this.overlay` (the screen-space layer).
  - On `app.ticker`: over ~900ms, interpolate the text position from the hex toward the score circle at the top-left corner (fixed target ~`(44, 44)` CSS px — the DOM circle center), scale up slightly, `alpha → 0`. On completion remove the text and the ticker callback.
  - Multiple flying texts can be active simultaneously; each has its own ticker callback with a `remove` helper.

## HUD

### `src/screens/hud/ScoreInfo.tsx` (new)

- Reads `players[currentPlayerIndex]`, computes `totalScore(map, player)` via `gameController.getMap()`.
- Renders a gold circle (fixed size ~64px) at the top-left corner with the big score number, `id="score-info"`.

### `src/screens/hud/PlayersList.tsx`

- For each player compute `totalScore(map, player)`; render rows with the score value; **sort by total score descending**.

### `index.html`

- Add `#score-info` styles: gold circle (`border-radius: 50%`, gold background, centered big text) at `top: 8px; left: 8px`.
- Move `#players-list` down below the circle (e.g., `top: 84px`) so they don't overlap.

## Files touched

- `src/game/score.ts` (new)
- `src/game/players.ts`
- `src/controller/gameController.ts`
- `src/screens/hud/ScoreInfo.tsx` (new)
- `src/screens/hud/PlayersList.tsx`
- `index.html`
- `tests/score.test.ts` (new)

## Testing

- `tests/score.test.ts`: `boardScore` (village/unit type/building contributions, ignores other players' tiles), `awardScore`, `totalScore`, constants.
- Existing suite (`npm test`), `npm run typecheck`, `npm run build` stay green.
- Manual via `npm run dev`: score circle counts up with board changes; upgrade/kill/capture award the bonus and fly "+40/+10/+50" toward the circle; players list sorted by score desc.

## Out of scope

- Skill-tree/trait integration with score.
- Score victory conditions or end-of-game scoring screens.
- Score animation for board-derived changes (only explicit actions fly "+N").
