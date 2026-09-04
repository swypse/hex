# AI Improvements A+B Design

Date: 2026-08-25

## Problem

The AI makes weak decisions: its fallback planner picks actions at random, it
never chains move→attack in the generic path, attacks the first available
target, and has no economy, retreat, or coordination tactics. This makes AI
players easy to outplay. All improvements below are decision-quality only — no
stat, resource, or rule changes.

## Decisions

1. **Variant A — best-action fallback**: replace `randomAvailableAction`'s
   random pool pick with a scored `bestAvailableAction`, add `chooseBestAttack`
   target selection, move→attack chaining, situation-aware spawns, and economy
   scoring.
2. **Variant B — tactical patterns**: add priority-ordered patterns for
   focus-fire (kill confirmation), capture-push (parking on enemy villages),
   counter-threat (retreating threatened units), retreat-heal (pulling back
   wounded units), and economy-opening (early growth).
3. Keep the existing patterns unchanged; new patterns get lower/higher
   priorities as designed below.

## Section 1 — Variant A: best-action fallback

### `src/game/combat.ts` — add `chooseBestAttack`

```ts
export function chooseBestAttack(map: GameMap, unit: Unit, playerIndex = 0): MapTile | null
```

Returns the attackable target with the highest score:

- +500 if `attackDamage(unit) >= target.hp` (guaranteed kill)
- `+ (maxHp - hp) * 3` (prefer damaged targets)
- unit value: swordsman +80, ship +90, archer +60
- +150 if the target stands on an enemy-owned settlement
- +40 if the target cannot counter-attack this turn (range > `target.attackDistance`)

`null` when nothing is attackable.

### `src/game/ai.ts` — replace `randomAvailableAction` with `bestAvailableAction`

Build a scored candidate list and return the single best (jittered so
near-equal choices vary across seeds — keeps existing "spawns and upgrades
across seeds" test passing):

- **capture** (on capture-ready foreign village): score 5000.
- **attack**: 4000 + target score via `chooseBestAttack`.
- **move→attack**: find a reachable tile (not `state.occupied`, not an own
  settlement) from which the unit can attack; score 3000 + target score
  − 5 × step distance. Emit `[move, attack]`.
- **move** (no attack): 100 − nearest-enemy-village distance after moving − 200
  if the tile is within an enemy's attack range. Prefer own-settlement tiles.
- **heal** (wounded, unthreatened, not moved/attacked): 600.
- **spawn** (empty own village, affordable): 500 if the village is enemy-
  reachable, else 250, always using `bestSpawnableUnitType`; skip if money
  would drop below the swordsman cost while no village is threatened.
- **upgrade** (affordable): 700 if the village is front-line (min enemy
  distance ≤ 4), else 350.
- **build** (affordable): mine/factory 400, port 200.
- **openSkill** (affordable, cheapest first): 150.

Each candidate score gets `+ rng.next() * 60` jitter. `planAiActions` keeps its
pattern-first loop; the fallback becomes `bestAvailableAction`.

## Section 2 — Variant B: new patterns (`src/game/aiPatterns.ts`)

Shared helper: `attackersForTile(map, playerIndex, targetTile, state)` returning
`{ unit, moveTo: MapTile | null }[]` — units that can attack the tile this turn
(now, or after moving to a reachable tile). Used by focus-fire and
capture-push.

1. **`focus-fire`** (priority 190): for each enemy unit `e`, collect its
   attackers; if there are ≥ 2 and the sum of `attackDamage` ≥ `e.hp`, plan
   attacks (with a move first where needed). Returns the action list.
2. **`capture-push`** (priority 110): for each enemy settlement not
   `captureReady` and not already occupied by an AI unit, if an AI unit can
   reach it this turn, plan `move` onto it (parking to block/capture).
3. **`counter-threat`** (priority 95): for each AI unit that an enemy can kill
   this turn (enemy within its attack range and `attackDamage(enemy) ≥ hp`):
   if the unit can kill that enemy now, attack; else move it to the safest
   reachable tile (max nearest-enemy distance).
4. **`retreat-heal`** (priority 85): for each wounded AI unit (hp < max/2)
   that is not on an own settlement and can be attacked next turn, move it to
   the reachable tile maximizing nearest-enemy distance (prefer own settlement).
5. **`economy-opening`** (priority 25): when the AI owns ≤ 4 units, prefer
   upgrading a front-line village, else building a mine/factory — one action.

## Files touched

- Modify: `src/game/combat.ts`, `src/game/ai.ts`, `src/game/aiPatterns.ts`.
- Test: `tests/combat.test.ts`, `tests/ai.test.ts`, `tests/aiPatterns.test.ts`.

## Testing

- Existing tests stay green.
- New tests:
  - `chooseBestAttack` prefers a killable target, then a damaged one, and
    prefers targets that cannot retaliate.
  - `planAiActions` chains move→attack (a unit within move-range of an enemy
    plans `[move, attack]`); capture is prioritized; spawn uses the best unit
    type.
  - Each new pattern: focus-fire directs two attackers at a killable target;
    capture-push parks a unit on an enemy village; counter-threat retreats a
    threatened unit; retreat-heal pulls a wounded threatened unit to safety;
    economy-opening upgrades/builds when small.
- `npm run typecheck` and `npm test` pass.
