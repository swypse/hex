# Tribe Circles Below the Resource Panel

## Overview

On the game screen, show a row of small circular chips below the resource panel
(the top-center money/wood/stone/ore row, `HudMoney`). One circle per tribe
currently in the game except the local player's own tribe, giving the player a
quick read of which opponents remain, which they have met, and which have been
eliminated. Visible in both single-player and multiplayer games.

## Changes

### New widget `src/ui/hud/HudTribes.ts`

Mounted in `GameScreen` together with the other HUD widgets (visible whenever
`screen === 'game'` and a local player exists). Subscribes to `useGameStore`.

**Which circles to draw:**
- Take `store.players`; skip the player at `store.localPlayerIndex`.
- Draw one chip per remaining player, ordered by player index. Players are
  distinct tribes, so each chip represents one opposing tribe.
- Keep chips for eliminated players in the row (dimmed, see below).

**Chip state:**
- *Explored*: the opposing tribe is present in the local player's own
  `knownTribes` list (the discovery union the simulator maintains in
  `player.knownTribes`). This mirrors how `HudTurn` decides whether it can show a
  waiting player's tribe name. The local player's own tribe always counts as
  known.
- *Unexplored*: not in that list.
- *Eliminated*: the player's `isActive` is `false`.

**Appearance (diameter ≈ 20px, `R = 10`):**
- Explored: a white filled circle background with the
  `<tribe-code>-icon.png` texture (`TRIBES.find(...)!.code`) drawn at 20×20 and
  clipped to the circle — the same visual language as the `HudPlayers` chips and
  the tribe picker (`makeIcon` + a circular `Graphics` mask).
- Unexplored: a filled grey circle (`UNKNOWN_TRIBE_COLOR`, `0x888888`) with a
  white `?` (`Text` via `makeLabel`, bold, centered). Reuses the game's existing
  "unknown tribe" colour.
- Eliminated: the whole chip container `alpha = 0.3` (content unchanged: icon if
  explored, `?` otherwise).

**Placement:**
- Row of circles centered at `screen.width / 2`, ~6px gaps between circles,
  vertically centred just below the resource panel (`y ≈ 44`, i.e. under the
  `HudMoney` panel which is ~30px tall at the top of the screen).
- Row width measured so it can be centered; re-centered on resize via the widget's
  `layout`, matching the pattern used by the other HUD widgets.

### Wiring `src/ui/screens/GameScreen.ts`

- Add `new HudTribes()` to the `gameWidgets` list (order: after `HudMoney`, so it
  stays grouped with the resource row). No other screen changes.

## Tests

- `tests/hudTribes.test.ts` (new), mirroring the existing `hudPlayers.test.ts`
  harness (fake app/host + `useGameStore.setState`):
  - hides when not on the game screen or when there is no local player;
  - draws one chip per opposing player, excluding the local player's tribe;
  - an explored tribe (present in the local player's `knownTribes`) shows the
    icon texture (a `Sprite` child) and no `?`;
  - an unexplored tribe shows a grey-filled circle with a white `?` and no icon;
  - an eliminated player's chip has `alpha ≈ 0.3`, and an active player's chip
    has `alpha = 1`;
  - chips are centered under the resource panel area (`el` positioned at
    `width / 2` minus half the row width).

## Out of scope

- No tooltips or tribe-name labels on the chips (can be added later).
- No change to how tribes are discovered/eliminated; the widget only reads the
  existing state via `player.knownTribes` and `player.isActive`.
- No persisted or networked state; each player sees their own discovery state.
