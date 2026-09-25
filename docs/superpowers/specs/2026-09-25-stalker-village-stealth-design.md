# Stalker Village Stealth Design

2026-09-25

## Problem

The stalker's stealth currently lets it walk right up to — and into — enemy villages
undetected, which is too strong. Enemy villages should "spot" a stealthed stalker that
approaches them. This spec adds four related rules around enemy villages:

1. **Approach confirm** — a stealthed stalker moving to a cell adjacent to an enemy village
   is prompted: *"Your stealth will be disabled."* Confirming moves it there and disables
   stealth; cancelling does nothing.
2. **No entry while stealthed** — a stealthed stalker can never move onto an enemy village's
   cell, even when it is empty.
3. **No stealth near villages** — a visible stalker standing on a cell adjacent to an enemy
   village cannot enable stealth.
4. **Global notification** — whenever the stalker becomes visible by entering that adjacent
   cell, **all** players see "Stalker in the {VillageName}".

### Decided rules (from brainstorming)

- **Detection radius**: strictly hex distance 1 from the village cell, regardless of village
  level (no scaling with the fog reveal radius).
- **Which villages**: only villages owned by an **enemy tribe** (`owner !== null` and `owner !==
  the stalker's owner`). Free (neutral) and own villages never trigger anything.
- **Reveal timing**: only when the move's **destination** cell is adjacent to an enemy village
  (a path merely passing through an adjacent cell does not reveal).
- **Multiple villages**: if the destination is adjacent to more than one enemy village, name
  only one (the first encountered) in the notification.
- **Invariant**: a stealthed stalker is never adjacent to an enemy village. If a free village
  adjacent to a stealthed stalker is captured by an enemy, the stalker is revealed instantly
  (and the notification fires), even though it never moved.

## Approach

Enforce the rules in the shared game rules (simulator + selection/pathing) so they hold in
single-player, multiplayer, and for the AI; the client adds the confirm dialog and the
notification. Client-only enforcement was rejected because a desynced client or the AI could
cheat; simulator-only was rejected because it would drop the required confirm prompt.

## Shared helpers (`src/game/stalker.ts`, new)

- `adjacentEnemyVillages(map, pos, owner): MapTile[]` — settlement tiles at hex distance 1 of
  `pos` with `settlement.owner !== null && settlement.owner !== owner`.
- `isMoveStealthed(unit): boolean` — `unit.isStealthed === true`, **or** a fresh stalker whose
  first move will auto-stealth (`type === 'stalker' && !firstMoveStealthDone &&
  shipLevel === undefined`). Keeps client move highlights consistent with the simulator, which
  applies auto-stealth before the walk.
- `stealthBarredVillageCell(unit, tile): boolean` — `tile` has a settlement owned by an enemy
  of `unit` and `isMoveStealthed(unit)`.

## Rule 2 — no entry while stealthed

- `selection.ts` `isEnterable` gains a trailing `stealthed = false` parameter; when set, a tile
  with an enemy-owned settlement is not enterable.
- Call sites pass `isMoveStealthed(unit)`: `reachableTargets` and `pathBetween`, threading the
  flag through to `pathBetweenSteps` / `pathBetweenCost` (these take a `stealthed` boolean rather
  than the unit). The simulator's `doMove` calls `pathBetween` without a unit, so a
  `stealthed = false` default keeps non-stalkers unchanged.
- This single change covers the client (the village cell is not highlighted as a reachable
  target) and the server (`doMove` already validates against `reachableTargets`, so the move
  command is rejected). No separate check in `doMove` is needed for this rule.

## Rule 1 — approach confirm + reveal

- `simulator.ts` `doMove`: after `moveUnit`, if the moving unit is a stealthed stalker
  (`unit.isStealthed === true`) and `adjacentEnemyVillages(map, unit, unit.owner)` is non-empty:
  - `revealStalker(unit)` (existing `stealthRevealed` event + reveal bookkeeping),
  - emit a new event `{ type: 'stalkerSpotted'; unitId; villageName; villageQ; villageR }`,
    naming the first village found.
- `game-controller.ts` `onTileClick`, move branch (before sending `move`): if the selected unit
  `isMoveStealthed` and the clicked destination is adjacent to an enemy village (same helper),
  open a new overlay `{ kind: 'stalkerReveal'; target: { q, r } }` instead of moving, mirroring
  the `shipLanding` dialog flow. Confirm sends the move; cancel dismisses.
  - If the enemy village is under fog for the local player, the adjacency cannot be computed and
    no prompt shows — the server still reveals and notifies (inherent to fog of war; acceptable).
- New controller methods `confirmStalkerApproach()` / `cancelStalkerApproach()` modeled on
  `confirmShipLanding` / `cancelShipLanding`.

## Rule 3 — no stealth near villages

- `simulator.ts` `doEnableStealth`: reject when `adjacentEnemyVillages(map, unit, unit.owner)`
  is non-empty.
- `toolbar-specs.ts`: the enable-stealth button is only offered when
  `adjacentEnemyVillages(...)` is empty.

## Rule 4 — global notification

- `event-presenter.ts`: handle `stalkerSpotted` by presenting
  `setCenterMessage(t('msg.stalkerSpotted', { village: e.villageName }))`. Events are replicated
  to every client in multiplayer, so all players (including the stalker's owner) see the
  message. `stealthRevealed` remains render-only.

## Capture edge case (invariant)

- `simulator.ts` `doCapture`: after `captureVillage` (ownership has changed), scan the captured
  village's neighboring cells for units with `isStealthed === true` and `owner !== newOwner`;
  reveal each and emit `stalkerSpotted` with that village's name. Keeping the invariant "a
  stealthed stalker is never adjacent to an enemy village".

## UI and text

- Store `OverlayState` gains `{ kind: 'stalkerReveal'; target: { q: number; r: number } }`.
- New dialog `src/ui/overlays/stalker-reveal-dialog.ts` wired into `overlay-manager.ts`,
  following the `ship-landing-dialog.ts` pattern (title, body, Confirm/Cancel buttons).
- i18n (add to both `en.ts` and `ru.ts` to preserve key parity):
  - `msg.stalkerSpotted` — `Stalker in the {village}!` / RU equivalent.
  - Dialog title + confirm body, e.g. "Move to {village}?" and "Your stealth will be disabled."
  - Button labels reuse `common.confirm` / `ui.cancel`.

## Docs

- `GAME.md`: extend the Stalker bullet under Special units with the four village rules.
- `help.stalker.*` entries (unit help) mention the village detection.

## Tests

- `tests/stealth.test.ts`:
  - Stealthed stalker cannot move onto an enemy village cell (rejected, `applyCommand` false,
    position unchanged).
  - Stealthed stalker moving to a cell adjacent to an enemy village is revealed, ends stealthed
    = false, and emits `stalkerSpotted` with the village name.
  - The same move with only a **free** / **own** village nearby does not reveal.
  - `enableStealth` is rejected while standing adjacent to an enemy village.
  - Capturing a free village adjacent to a stealthed stalker reveals it and emits
    `stalkerSpotted`.
  - A fresh stalker's first (auto-stealthing) move cannot target an enemy village cell.
- `tests/selection.test.ts` / `tests/reachability`: enemy settlement cell excluded from
  `reachableTargets` for a stealthed / will-be-stealthed stalker, but still allowed for a
  visible stalker.
- `tests/toolbar-specs.test.ts`: stealth button hidden when the stalker stands adjacent to an
  enemy village.
- `tests/event-presenter` / center-message: `stalkerSpotted` sets the expected center message.
- i18n key parity (EN/RU) for the new keys.