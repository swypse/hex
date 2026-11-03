# Design: Battle mechanics (first version)

Date: 2026-08-16

## Goal

Add first-version combat: units have attack + attackDistance, selected unmoved units can attack enemies within range (after a confirm prompt), damage scales with current HP, the defender strikes back, units die at 0 HP. AI prefers attacks over moves and moves greedily toward the nearest enemy.

## Unit data model (`src/game/units.ts`)

- `Unit` gains `attack: number` and `attackDistance: number`.
- Constants: `UNIT_ATTACK: Record<UnitType, number> = { warrior: 2 }`, `UNIT_ATTACK_DISTANCE: Record<UnitType, number> = { warrior: 1 }`.
- `mapGen.ts` unit placement initializes `attack: UNIT_ATTACK['warrior']`, `attackDistance: UNIT_ATTACK_DISTANCE['warrior']`.
- `hasMoved` doubles as the single "acted this turn" flag: attack also sets `hasMoved = true` (move-after-attack and attack-after-move both blocked).

## Combat logic (`src/game/combat.ts`, new — pure & testable)

```ts
interface AttackResult {
  attackerDamage: number;
  targetDamage: number;
  attackerDied: boolean;
  targetDied: boolean;
}

function attackDamage(attacker: Unit): number;                 // Math.round(attack * hp / MAX_HP); may be 0
function attackableTargets(map: GameMap, unit: Unit): MapTile[]; // enemy unit within attackDistance, target terrain != Water
function performAttack(map: GameMap, attacker: Unit, target: MapTile): AttackResult;
```

- `attackableTargets`: tiles whose `unit` is owned by a different player, `hexDistance(unit, tile) <= attackDistance`, and `tile.terrain !== Water`.
- `performAttack`: `attackerDamage = attackDamage(attacker)` applied to target; if target survives (`hp > 0`), `targetDamage = attackDamage(target)` applied to attacker. Sets `hasMoved = true` on both. Death (`hp <= 0`) removes the unit from its tile (`tile.unit = null`). Villages are unaffected.

## Human attack interaction (`src/controller/gameController.ts`)

- `handleMapClick`: when the current selection is a human's unmoved unit and the clicked tile is in `attackableTargets`, set the store's pending-attack (show confirm prompt) instead of cycling selection.
- Confirm → `performAttack`, popups, re-render, clear selection.
- Cancel → clear the pending attack, keep selection.

## Confirm prompt (`src/store/gameStore.ts` + `src/ui/ConfirmDialog.tsx`)

- Store gains `pendingAttack: { q: number; r: number } | null` and `setPendingAttack(...)`.
- New React `ConfirmDialog` renders when `pendingAttack !== null`: message `"Attack {EnemyName}?"` with Confirm / Cancel buttons.
- Confirm button calls `gameController.confirmAttack()`; Cancel calls `gameController.cancelAttack()`.

## Rendering (`src/render/mapRenderer.ts`)

- `renderMap` gains an `attackableKeys: Set<string>` parameter alongside `reachableKeys`.
- Attackable enemy tiles render a red glow/outline (distinct from move ghosts) when a human's unmoved unit is selected.

## AI (`src/game/ai.ts` + `src/controller/gameController.ts`)

- `AiAction` gains `{ type: 'attack'; unitId: string; q: number; r: number }`.
- `planAiActions` for each unmoved unit:
  - If `attackableTargets` non-empty → emit an `attack` action (preferred over move).
  - Else move greedily: among `reachableTargets`, pick the tile minimizing hex distance to the nearest enemy unit.
- `gameController.runAiPhase` executes `attack` actions via `performAttack` with the same attack/death popups and 300ms pacing.

## Popups (`src/controller/gameController.ts`)

- Each attack: `"{AttackerName} attacks {TargetName}: -{N} hp"` (both directions).
- Each death: `"{Name} dies"`.
- Colors: attacker's tribe color background.

## Tests

- `combat.ts`: damage scaling (5/5→2, 3/5→1, can be 0), mutual response attack, `hasMoved` set on both units, deaths remove units, `attackableTargets` excludes friendly units and water.
- `ai.ts`: attack preferred over move; greedy move targets the tile closest to the nearest enemy; new `attack` action emitted.
- Manual: full flow via headless Chrome (select unit → click enemy → confirm → both take damage → popups → possible death).
