# Detailed Game-Over Score Screen

## Overview

Replace the simple game-over list with a detailed screen: a top row of circular tribe
icons (current player first, selected by default, then others ranked by place, each with a
colored place badge), and a details area showing the selected player's itemized score
breakdown that sums to their total score.

## Changes

### 1. Score statistics tracking

- `Player` gains an optional `stats?: PlayerStats` (optional to avoid churning the many test
  `Player` literals, same convention as `knownTribes`). Builders seed it with zero values;
  the simulator ensures it exists before mutating.
- `PlayerStats` (defined in `src/game/score.ts`):

```ts
export interface PlayerStats {
  killedUnits: number;      // this player's units killed by others
  pirateKills: number;      // pirates this player killed
  villagesCaptured: number;
  villageUpgrades: number;
}
export const EMPTY_STATS: PlayerStats = { killedUnits: 0, pirateKills: 0, villagesCaptured: 0, villageUpgrades: 0 };
```

- The simulator updates the counters at the existing award sites:
  - `doAttack` / `pirateAttack`: when a unit dies, `players[dyingUnit.owner].stats.killedUnits++`
    (skip pirates, owner `-1`); when a pirate is killed, the killer's `stats.pirateKills++`.
  - `doCapture`: `capturer.stats.villagesCaptured++`.
  - `doUpgradeVillage`: `player.stats.villageUpgrades++`.
- Non-pirate kills are derived as `player.kills - stats.pirateKills` (the existing `kills`
  counter includes pirates). Skills opened = `player.skills.length`.

### 2. Score breakdown derivation (`src/game/score.ts`)

- New pure function:

```ts
export interface ScoreBreakdownItem {
  label: string;
  count: number;
  score: number;
}
export function scoreBreakdown(map, players, player, bonusAwarded): ScoreBreakdownItem[]
```

- Returns items in this order (scores from the existing constants):
  1. `Killed units: N` (count only, score 0)
  2. `Kills: N` — `player.kills - pirateKills`, score `count * KILL_SCORE`
  3. `Pirate kills: N` — `pirateKills`, score `count * PIRATE_KILL_SCORE`
  4. `Buildings: N` — owned non-temple buildings, score `count * BUILDING_SCORE`
  5. `WaterTemples: N` — owned `temple` buildings, score sum of `TEMPLE_SCORES[level]`
  6. `ForestTemples: N` — owned `forestTemple` buildings, score sum of `TEMPLE_SCORES[level]`
  7. `Captured villages: N` — `villagesCaptured`, score `count * CAPTURE_SCORE`
  8. `Village upgrades: N` — `villageUpgrades`, score `count * UPGRADE_SCORE`
  9. `Skills opened: N` — `player.skills.length`, score `count * SKILL_SCORE`
  10. `Explored tiles: N` — tiles explored by the player, score `count * EXPLORED_SCORE`
  11. `Villages: N` — owned settlements on the board, score `count * VILLAGE_SCORE`
  12. `Units: N` — owned units on the board, score per unit type (WARRIOR/RIDER/ARCHER)
  13. `Fast capture-mode bonus: X` — `bonusAwarded` (and this player is the winner) ?
      `bonusScoreFor(players.length)` : `0`
  14. `Total: X` — sum of all scores, equal to `totalScore(map, player)`.

- Board/temple/explored items are derived from the final map, so no in-game tracking is
  needed for them.

### 3. Ranking (`src/game/gameMode.ts`)

- New pure `rankPlayers(players, map): Player[]` sorting by the `computeWinner` tiebreakers:
  total score desc → kills desc → fewest units on board → alphabetical name. Used for place
  badges and the "others sorted by place" order.

### 4. Game-over screen rework (`src/ui/overlays/GameOver.ts`)

- **Top area**: a row of circular tribe icons. The current player's icon is first and
  selected by default (highlighted ring); the remaining players follow sorted by place.
  Each icon = tribe icon image inside a circle (like the tribe selection circles), with a
  small **place badge** circle overlapping the tribe circle's bottom showing `1`, `2`, `3`,
  …; badge background gold (`0xffd700`) for 1, silver (`0xc0c0c0`) for 2, bronze
  (`0xcd7f32`) for 3, gray (`0x888888`) for 4+.
- **Details area**: for the selected player, renders the `scoreBreakdown` rows (`Label: N, Scores: X`
  with score omitted when 0 for count-only rows). Clicking a tribe icon re-selects and
  re-renders the details.
- Winner banner, mode line, fast-bonus line, and the Play again / Main menu buttons remain.

### 5. Tests

- `tests/simulator.test.ts`: kills/captures/upgrades/pirate-kills increment `Player.stats`.
- `tests/score.test.ts`: `scoreBreakdown` item counts/scores and that its sum equals
  `totalScore`.
- `tests/gameMode.test.ts`: `rankPlayers` order with ties.
- `tests/gameOver.test.ts` (new): current player selected by default; place badge colors;
  selecting another tribe icon shows that player's details.

## Out of scope

- No change to the winner logic (`computeWinner`) or the scoring constants.
- No change to the HUD score circle or stats screen.
