# Design: Shield cannot attack after moving

Date: 2026-08-28

## Overview

Shield units cannot perform an attack action in a turn in which they have
already moved. They may still move or attack (not both), and their defensive
counter-attack is unaffected.

## Behavior

- `canAttack(shield)` returns `false` when the shield has `hasMoved === true`.
- All other units are unchanged (they can still move then attack).
- A shield that attacks still cannot move afterward (existing rule), so a shield
  can never move and attack in the same turn.
- Counter-attacks are untouched: they are driven by attack range in
  `performAttack`, not by `canAttack`.

## Implementation

`src/game/units.ts`, `canAttack`:

```ts
export function canAttack(unit: Unit): boolean {
  return (
    !unit.hasAttacked &&
    !unit.hasHealed &&
    !unit.hasLanded &&
    !(unit.type === 'shield' && unit.hasMoved)
  );
}
```

All consumers (`attackableTargets`, `unitCanAct`, the simulator's `doAttack`,
the toolbar attack spec) already go through `canAttack`, so no other change is
needed.

`GAME.md`: note in the Unit actions "Attack" bullet that a shield cannot attack
after moving.

## Tests

- `tests/units.test.ts`: a fresh shield can attack; a shield that moved cannot;
  a shield that attacked still satisfies the attack flags; a non-shield unit can
  still attack after moving.
- `tests/simulator.test.ts`: a shield that moved cannot issue an attack command;
  a shield that did not move can.

## Out of scope

- No change to rider move-after-attack, ships, or pirates.
