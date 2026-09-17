# Move Points Design

Date: 2026-09-17

## Goal

Replace the flat per-unit movement range with a **move-points** model: each tile
has a move-points cost, a unit's move property is a pool of move points
(current value × 10), and a unit may move while it still has enough points.
Move markers may only appear on tiles the unit can actually reach within its
move points.

## Decisions (asked & answered)

- **Road / water-road discount is owner-only.** A tile costs half only for the
  player whose road (`roadOwner === unit.owner`) or whose water-road (route
  between its own ports, `ownedBy === unit.owner`) it is.
- **A village connected to the owner's road network** counts as a road tile for
  its owner (half cost). This preserves the old "village + road = +1" bonus.
- The old flat `+1` move-range bonus for standing on an own road / connected
  village is **removed**; the per-tile half-cost replaces it.

## Tile move points cost

`src/game/movementCost.ts` (new):

- Base cost by terrain:
  - land / settlement: **10**
  - water: **10**
  - forest: **14**
  - mountain: **20**
- Half cost (`Math.floor(base / 2)`) when the tile benefits the unit's owner:
  - `tile.roadOwner === owner` (bridges already set `roadOwner`, so they
    count for free: land-with-road, floor(10/2) = 5),
  - the tile is part of a water-road route (a key in `waterRouteEdges(map)`)
    AND `tile.ownedBy === owner`, or
  - `tile.settlement.owner === owner` AND an adjacent tile has
    `roadOwner === owner` (own village connected to own road).

Road discount math: land road 5, forest road 7, mountain road 10, water-route
tile 5, bridge 5.

Note: cost *depends on the moving unit's owner*, so it is a function of
`(map, tile, owner)`, with the route keys computed once per query.

## Unit move points

- `UNIT_TYPES.*.movement` × 10 and renamed `movePoints`:
  warrior 10, archer 10, swordsman 10, shield 10, catapult 10, rider 40,
  knight 30, pirate 50.
- `SHIP_MOVEMENT` 2/3/4 → `SHIP_MOVE_POINTS` 20/30/40; `shipMovement` →
  `shipMovePoints`.
- `UNIT_MOVEMENT` → `UNIT_MOVE_POINTS`.
- `moveRange(unit, tile?, map?)` is replaced by `movePoints(unit)` (movement
  points for the unit, no road bonus). Callers updated.

## Movement rule

- **Reachability:** a tile is reachable when the unit has a path to it whose
  total cost fits within its move points, **or** the tile is a direct neighbor
  (distance 1) — a unit can always make a 1-tile move even without enough
  points.
- **Cost accounting:** leaving a tile costs that tile's move-points cost.
  Reaching a tile at step k costs the leaving-costs of all tiles departed
  along the path (everything except the destination itself). Cost 0 is the
  origin; the first step pays the origin tile's own cost.
- **Enterability** (unchanged from today): explored for the moving player; not
  occupied; mountains need `canClimb`; land units may enter water only on a
  bridge or an own port with `canDock`; ships may travel water only (a
  non-water coast tile is enterable only as the final tile and never expanded
  from); movement may end on a tile adjacent to an enemy but never continue
  past it.

## Reachability algorithm

`selection.ts`:

- `reachableTargets(map, unit, movePoints?, canClimb, canDock, playerIndex)` —
  a single cost-limited **Dijkstra** (node cost = leaving cost of the departed
  tile) from the unit's tile:
  - every direct neighbor of the origin is always added to the reachable set;
  - a tile is expanded only when its accumulated cost ≤ move points;
  - tiles adjacent to enemies are terminal (reachable, not expanded);
  - ships never expand from a non-water tile.
- `pathBetween(map, from, to, canClimb, canSail, canDock, playerIndex,
  movePoints = Infinity)` — the same weighted search, returning the
  min-cost path within the budget (used for move validation and animation).
  Existing callers (`simulator` move/landing) pass the unit's move points.
- One search per query replaces today's "one BFS per candidate", so this is
  also cheaper.

## AI & scale-dependent code

- `aiSituation.turnsToOccupy` and any heuristic multiplying/rounding raw
  movement values are scaled by 10 (points ÷ 10 ≈ tiles over flat land) so
  turn estimates stay unchanged.
- `simulator` pirate step-slicing (`path.slice(0, UNIT_MOVEMENT.pirate)`) and
  `aiPatterns` distance math reviewed for the new magnitude.

## UI / docs

- `unitDescriptions.ts`: stat row shows move points (e.g. "10 move points").
- i18n: `help.stat.movement` → move-points wording; unit help lines updated
  (`1 movement` → `10 move points`, etc.); `ru.ts` updated.
- `GAME.md`: unit table "Movement" → "Move points" (10/40/10/10/10/10/30 for
  warrior/rider/archer/swordsman/shield/catapult/knight); ships
  "20/30/40"; Move action description rewritten (tile costs, own-road /
  own-village+road / water-road halving, always-move-1, points budget);
  pirates "move 5 on sea" → "50 move points".

## Renderer

- Move markers keep rendering `reachableKeys` (white dots, as today); the
  controller's `reachableKeys` already comes from `reachableTargets`, so
  markers satisfy "only on reachable tiles" automatically once reachability is
  correct. No renderer change needed beyond the existing call signature.
- `gameController` selection code passes the unit's move points (or relies on
  the `reachableTargets` default).

## Tests

- `units.test.ts`: movement values ×10; `moveRange` → `movePoints`; road-bonus
  tests replaced by tile-cost/reachability tests.
- New `movementCost.test.ts`: base costs; own-road / foreign-road / bridge;
  water-road discount; own-village+road discount; forest/mountain values.
- `selection.test.ts`: rewrite reachable-target assertions in the points
  domain (e.g. `reachableTargets(map, unit, 20)` = 2 land tiles); add
  cost-chain cases (forest/road), always-move-1, water-road routes.
- `aiSituation.test.ts`, `unitDescriptions.test.ts`, `unitHelpDialog.test.ts`:
  updated for points-scale values and new labels.

## Out of scope

- No leftover-points UI, no per-tile cost display, no animation changes.
- No change to attack ranges, capture, or the bonus explorer (which has its
  own step logic).