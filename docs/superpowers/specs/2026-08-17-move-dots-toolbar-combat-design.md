# Design: Move-cell dots, faster AI, combined toolbar, ranged no-retaliation

Date: 2026-08-17

## Goal

1. Move-available cells show a red dot instead of a red border.
2. Halve the AI turn delays.
3. The action toolbar shows all self-targeted actions for the selected cell (unit + village together).
4. Ranged attackers take no counter-damage when the attacked unit cannot reach them.
5. Highlighting refinements: a selected unit highlights its shape, not its hex; the selected border renders above territory borders and pulses.

## Design

### 1. Move-available cells → red dot; selected unit → shape border

In `src/render/mapRenderer.ts`, replace `drawHighlightBorders` with `drawHighlights`:

- Reachable tiles (move targets): a small filled red dot at the cell center — `Graphics.circle(hexSize * 0.14)` filled `0xff0000`. No border.
- Selected tile:
  - If the tile holds a unit (selection kind is a unit): no hex border; instead a red outline around the unit's shape (circle/square/triangle, sized `hexSize * 0.2 + 3`, stroke width 3).
  - Otherwise (village/terrain): red hex border, stroke width animated (see section 2).
- Attackable tiles: static red 4px hex border (unchanged).

`drawHighlights` is called **after** `drawOwnedBorders` so the selected border renders above territory borders.

### 2. Halve AI delays

In `src/controller/gameController.ts` `runAiPhase`:

- Pause between AI actions: `300` → `150` ms.
- Per-turn minimum time: `5000` → `2500` ms.

### 3. Toolbar shows all self-targeted actions for the cell

`src/screens/hud/ActionToolbar.tsx` no longer gates on `selection.kind`. For the selected cell it renders, in a stable order:

- Village actions (if the tile has a settlement):
  - `Capture village!` when the cell is capturable (not owned, has a player-0 unit, `captureReady`).
  - `Spawn a unit` when the village is owned by player 0.
  - `Upgrade village` when the village is owned by player 0 and affordable.
- Unit actions (if the tile has a player-0 unit):
  - `Heal +2 HP` when `canHeal(unit)`.
  - `Collect resources` when `canCollect(unit)` and the tile yields something.

Both groups can appear together.

Controller support: `captureSelectedVillage`, `upgradeSelectedVillage`, `spawnSelectedVillage`, and `SpawnDialog` target the selected cell's contents instead of requiring `selection.kind === 'village'` (they still use `selection.q`/`selection.r` for the tile).

### 4. Ranged attackers take no counter-damage when out of reach

In `src/game/combat.ts` `performAttack`, the target's counter-damage applies only when the target can reach the attacker:

```ts
const distance = hexDistance(
  { q: attacker.q, r: attacker.r },
  { q: target.q, r: target.r },
);
if (!targetDied && distance <= targetUnit.attackDistance) {
  targetDamage = attackDamage(targetUnit);
  attackerDied = attacker.hp - targetDamage <= 0;
  attacker.hp = Math.max(0, attacker.hp - targetDamage);
}
```

Adjacent melee exchanges are unchanged (distance 1 ≤ melee reach 1). An archer attacking from beyond the target's reach takes no return damage.

### 5. Pulsing selected hex border

The selected tile's red hex border (village/terrain selections) pulses infinitely: stroke width oscillates `2 → 6 → 2` using a sine over a ~1.2s period, driven by `app.ticker` in `mapRenderer`. The animation is stopped when the next `renderMap` call runs (a module-level stop callback). The unit-shape border and attackable borders stay static.

## Files touched

- `src/render/mapRenderer.ts` — highlight dots vs borders, unit-shape border, z-order, pulse animation.
- `src/controller/gameController.ts` — AI delays; village action methods target the cell.
- `src/screens/hud/ActionToolbar.tsx` — combined actions.
- `src/ui/SpawnDialog.tsx` — accept any selection kind for the cell.
- `src/game/combat.ts` — counter-damage reach check.
- `tests/combat.test.ts` — ranged no-retaliation test.

## Testing

- `performAttack`: a melee exchange still deals both ways; an archer attacking from distance 2 (target reach 1) takes zero counter-damage (combat tests).
- Manual (`npm run dev`): move cells show red dots; a selected unit shows a red shape outline (no hex border); a selected village/terrain shows a pulsing red border above the territory borders; AI turns are snappier; a cell with a unit and village shows heal/collect + spawn/upgrade/capture together; archers don't take damage when attacking beyond the target's reach.
