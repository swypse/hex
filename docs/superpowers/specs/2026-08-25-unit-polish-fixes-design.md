# Unit Polish and Fixes Design

Date: 2026-08-25

## Problem

Several polish and correctness issues in the game screen:

1. The selected unit bounces continuously instead of bouncing once.
2. Opening a skill in the skill tree leaves the node black (unopened) and does
   not update the displayed resource amounts.
3. The capturable-village marker (`capture.png`) is too small.
4. There is no notification when a player is eliminated.
5. Ship landing near an enemy was reported as blocked; investigation concluded
   the movement logic already allows landing next to land enemies.

## Decisions

1. Change the selected-unit bounce from a loop to a single up-down cycle.
2. Make the skill tree reactive to store changes so nodes and resources update
   when a skill is opened.
3. Increase the capture marker size by 3×.
4. Show a center notification `<TribeName> died!` when a player loses their last
   village.
5. No code change for ship landing — see Section 5.

## Section 1 — Single bounce on selection

`src/render/mapRenderer.ts`, `updateSelectedBounce`: change the continuous
oscillation (`(performance.now() - start) % 700`) to a single cycle using
`k = sin(π · t)` over ~600ms (`t = min(1, elapsed/600)`), ending at the base
position. The bounce still applies only to units owned by the local player, still
switches cleanly when the selection changes, and still stops on `destroy()`.

## Section 2 — Reactive skill tree

Root cause: `SkillTree` builds once on mount and only rebuilds on Open/Escape.
`gameController.openSkill` enqueues a command that updates the store
asynchronously, so `build()` reads stale `players` state — the node stays black
and the resources line shows the pre-purchase amounts.

Fix: in `src/ui/overlays/SkillTree.ts`, subscribe to the store on `mount` and
call `build()` on changes. Rebuilds are cheap and the tree is only mounted while
open. This updates both the node visuals (opened → orange with ✓) and the
resources header line.

## Section 3 — Capture marker 3× bigger

`src/render/mapRenderer.ts`, capture-marker block: change the sprite width from
`this.hexSize * 0.7` to `this.hexSize * 2.1` (height stays proportional via the
texture aspect ratio).

## Section 4 — "TribeName died!" notification

A player is eliminated when they lose their last owned village. The simulator
already flags this on the `captured` event via `ownerDied: true`
(`src/game/simulator.ts` sets `isActive = false` when the old owner has no owned
tiles left).

Fix: in `src/controller/gameController.ts`, `presentCaptured`, when
`e.ownerDied && e.oldOwner !== null`, show a center message using the eliminated
player's tribe name: `store.setCenterMessage('<TribeName> died!')`. This uses the
existing center-message mechanism (auto-dismisses after ~1s). Tribe name via
`TRIBES.find((t) => t.id === players[e.oldOwner].tribe)?.name`.

## Section 5 — Ship landing near an enemy (investigated, no change)

Investigation (verified against `reachableTargets`/`pathBetween`/`moveRange`):

- A ship can land on a coast tile adjacent to a **land** enemy when an open water
  path exists — reproduced with several layouts, all pass.
- The only reproducible blocker is an enemy unit occupying a **water** tile in the
  ship's approach path (enemy ships block passage), or the coast being outside the
  ship's movement range. Both are intended behavior.
- No code change is made. If the reported failure reproduces after this batch,
  exact map coordinates are required to investigate further.

## Files touched

- Modify: `src/render/mapRenderer.ts` (single bounce, capture size).
- Modify: `src/ui/overlays/SkillTree.ts` (store subscription).
- Modify: `src/controller/gameController.ts` (`presentCaptured` death message).

## Testing

- `npm run typecheck` and `npm test` must pass (no game-logic changes).
- Manual (`npm run dev`):
  1. Selecting your own unit bounces it once (up-down), then it settles; enemy
     selection does not bounce.
  2. Open the skill tree, open a skill: the node turns orange with ✓ and the
     money in the header drops by the skill cost immediately.
  3. A capturable village shows the `capture.png` marker at 3× the previous size,
     still bobbing.
  4. Eliminating a player shows a centered "<TribeName> died!" message.
