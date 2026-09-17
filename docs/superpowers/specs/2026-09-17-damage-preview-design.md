# Expected-Damage Preview on Enemy Long-Press — Design

Date: 2026-09-17

## Summary

Let the local player long-press (touch) or click-and-hold (mouse) on any
explored enemy unit to see the expected damage of an attack, computed with the
combat formula in `src/game/combat.ts`. Two badges appear — `-N` over the
enemy's hp bar (damage the selected friendly unit would deal) and `-N` over the
selected unit's hp bar (the counter damage it would take) — shown only while
the press is held.

## Trigger

- `pointerdown` on the map starts a ~500 ms hold timer at the press position.
- The preview fires when: the pointer is still down after the timer, the camera
  is not dragging, and the pressed tile holds an **explored enemy unit** (owner
  ≠ local player, visible to the local player).
- Quick taps are unaffected (the existing `pointertap` click still fires).
- Preview hides immediately on `pointerup`, `pointercancel`, or as soon as the
  pointer drags enough to start a camera pan.
- Holding over an empty / friendly / unexplored tile shows nothing.
- The enemy does **not** need to be in the selected unit's attack range — any
  explored enemy can be previewed.

## Numbers shown

Let A = the locally selected unit (owner = local player), E = the long-pressed
enemy. Uses `resolveCombat(map, A, targetTileOfE)` from `combat.ts` (pure,
already tested; accounts for hp scaling, defense, and tile `defenseBonus`):

- **Badge over E:** `-{attackerDamage}` — what A's hit would deal to E.
- **Badge over A:** `-{counterDamage}` — only when the counter would actually
  happen, mirroring `performAttack`: E survives A's hit (`attackerDamage < E.hp`),
  E is within its own `attackDistance` of A, and `canCounterAttack(E)`. Otherwise
  no badge over A.
- Miss chance is ignored — the preview is deterministic.
- **No selected unit (or selection not a unit)** → no preview at all.

## Rendering

- Both badges are red `-N` text in a black circle with alpha 0.8, centered above
  each unit's hp bar.
- Added to `mapRenderer` as world-anchored overlay items so they track cam pan
  and zoom with their units, using the same anchor point as `addHpBar`
  (`{ x, y - unitTextureTop + 40 }`).
- Cleared whenever the overlay is rebuilt (`clearOverlayItems` /
  `releaseOverlay`) and replaced on each `MapView.update` while active.

## Files

- `src/controller/gameController.ts` — hold timer on the map `pointerdown`;
  wire `pointerup` / `pointercancel` / drag-start to hide. Expose
  `showDamagePreview(selectedUnit, targetTile)` / `hideDamagePreview()` on the
  controller or call `mapView` directly.
- `src/render/mapRenderer.ts` — `showDamagePreview`/`hideDamagePreview`, badge
  rendering (red text + black α0.8 circle), reuse of hp-bar anchor.
- `src/game/combat.ts` — no changes (uses existing `resolveCombat`,
  `canCounterAttack`).

## Out of scope

- No change to actual combos, selection UX, or the tap click path.
- No change to `-N` semantics for pirates or ships beyond `resolveCombat`'s
  built-in handling.

## Verification

- `npm test`, `npm run typecheck`, `npm run build`.
- New `mapRenderer` tests: a long-press shows the badge on an enemy with a
  selected friendly; the counter badge is hidden when the enemy is out of its
  own counter range (`hexDistance > enemy.attackDistance`).