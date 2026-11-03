# Village Connection Income Bonus Design

Date: 2026-09-12

## Goal

A village that has a road/water connection to any other village owned by the
same player earns **+1 money per turn**, applied after its income floor (so a
village whose upkeep exceeds its base still earns 1 while connected).

## Connection definition

Reuse `isVillageRoadConnected` (`src/game/roads.ts:50`) — the same network
logic that drives the connected-village icon in the renderer. A village is
connected when BFS from it reaches another same-owner settlement over: own road
tiles (`roadOwner === owner`), own ports (`building.kind === 'port' &&
ownedBy === owner`), same-owner settlement tiles, and own-water cluster jumps
(`portWaterClusterJumps` — ports in the same own-water cluster count as
adjacent). Two adjacent own villages count as connected even without roads.

## Current income flow (single source of truth)

`villageIncome` (`src/game/capture.ts:38`):
`base = 3 + level * 2`, `net = max(0, base − villageMaintenance)`, returns 0
when an enemy unit occupies the village tile.

Downstream consumers all call `villageIncome`:
- `villageIncomeTotal` (`capture.ts:45`) — end-turn collection (`simulator.ts:1074`) and money HUD (`HudMoney`).
- Selected-village income line (`hud.selected.income` in `HudSelected`).
- Village help text (`helpTexts.ts:21`).

## Change

### `src/game/capture.ts`

Add a constant and modify `villageIncome`:

```ts
export const VILLAGE_CONNECTION_BONUS = 1;

export function villageIncome(map: GameMap, villageTile: MapTile): number {
  if (villageEnemyOccupied(villageTile)) return 0;
  const level = villageTile.settlement!.level;
  const base = 3 + level * 2;
  const net = Math.max(0, base - villageMaintenance(map, villageTile));
  return isVillageRoadConnected(map, villageTile) ? net + VILLAGE_CONNECTION_BONUS : net;
}
```

- Bonus applied **after the floor** (confirmed): `max(0, base − maint) + 1`.
- Enemy-occupied villages return 0 first (no bonus while blocked).
- Import `isVillageRoadConnected` from `./roads`.

No change needed in `villageIncomeTotal`, `HudMoney`, `HudSelected`,
`helpTexts`, or the simulator — they all inherit the bonus through
`villageIncome`.

### Performance

`isVillageRoadConnected` builds `portWaterClusterJumps(map)` per call (via its
default arg). The renderer already calls it once per village per frame, and
`villageIncomeTotal` is O(map × villages). Map sizes are small; accept the
current cost, no optimization.

## Tests (`tests/capture.test.ts`)

Use the existing `makeTile`/`makeUnit` helpers. Road-tile helpers need
`roadOwner: 0` (not set by `makeTile`).

- **Unconnected village unchanged** (existing tests already cover this: a single
  village map has no connection → same numbers).
- **Two villages joined by a road chain** each earn +1: village at (0,0) and
  (2,0), road tiles at (1,0) and (0,1) (both `roadOwner: 0`), so the BFS
  connects them; expect `base + 1` for each.
- **Three-village chain earns +1 each, not +2**: villages (0,0), (2,0), (4,0)
  road-connected along the chain; each `villageIncome` = base + 1.
- **Directly adjacent villages (no roads) count**: two adjacent own settlements
  → +1 each.
- **Enemy-occupied connected village**: a connected village with an enemy unit
  standing on it → 0.
- **`villageIncomeTotal` sums bonuses**: two road-connected villages of the
  same player → `(base1 + 1) + (base2 + 1)`.

## Out of scope

- No UI change beyond what `villageIncome` already feeds (the `+1` appears in
  money income totals and the village income line automatically).
- No change to road building, ports, water routes, or the connected-village
  icon logic.
- The bonus is per-village binary (connected or not), not per-connection.