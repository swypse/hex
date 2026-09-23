# Design: Rider moves again after attack with distance 2

Date: 2026-08-28

## Overview

Riders can already move again after attacking (the `canMove` rule allows it).
This change raises that post-attack move distance from 1 to 2.

## Behavior

- A rider that has already attacked this turn may still move up to **2** tiles
  (previously 1).
- A rider that has not attacked moves its normal 3.
- The road bonus still stacks: a rider that attacked on its own road tile moves
  up to 3.
- Ships and all other units are unaffected.

## Implementation

`src/game/units.ts`, `moveRange(unit: Unit, tile?: MapTile): number`:

```
base = unit.shipLevel !== undefined
  ? shipMovement(unit)
  : unit.hasAttacked && unit.type === 'rider'
    ? 2
    : UNIT_MOVEMENT[unit.type]
return tile?.roadOwner === unit.owner ? base + 1 : base
```

No other call sites change: the human UI (`reachableKeys`), the simulator's move
validation, `unitCanAct`, and the AI all compute range through
`moveRange`/`reachableTargets`, so they all inherit the new distance.

`GAME.md`: note in the Unit actions "Move" bullet that a rider can move again
after attacking, distance 2.

## Tests

- `tests/units.test.ts`: `moveRange` for a rider that attacked returns 2; on its
  own road it returns 3; a fresh rider returns 3.
- `tests/simulator.test.ts`: a rider that attacked can move 2 tiles (accepted),
  and cannot move 3 (rejected).

## Out of scope

- No change to the rider's attack behavior or other units.
