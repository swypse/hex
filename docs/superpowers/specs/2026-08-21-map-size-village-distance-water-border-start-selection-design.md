# Map Size, Village Distance, Water Border, and Start Selection Design

Date: 2026-08-21

## Problem

Four gameplay/QoL changes:

1. On game start, the local player's unit should be pre-selected.
2. Minimum distance between villages should be 4 (currently 3).
3. The map should be bigger.
4. A 1-tile water border should ring the entire map.

## Design

### 1. Auto-select player's unit at game start

In `gameController.startGame()` (`src/controller/gameController.ts:210`), after the map is
generated and rendered, set the store selection to the local player's starting warrior:

```ts
const start = map.spawns[store.localPlayerIndex].start;
store.setSelection({ kind: 'unit', q: start.q, r: start.r });
```

`store.localPlayerIndex` is set to `0` right before (line 224). In multiplayer, each client
runs their own `startGame`-equivalent setup (host runs it; clients adopt snapshots), so the
host selects its own unit; clients keep whatever selection state they have.

### 2. Min village distance 4

In `generateMap` (`src/game/mapGen.ts:97-98`), change the closeness check:

```ts
const isTooCloseToAnyVillage = (t: { q: number; r: number }): boolean =>
  placedVillages.some((v) => hexDistance(t, v) < 4);
```

Update `tests/mapGen.test.ts`:
- Line ~27-35: `>= 3` → `>= 4`
- Line ~126-132: `>= 3` → `>= 4`

### 3. Bigger map

In `mapRadiusFor` (`src/game/mapGen.ts:49-54`), bump each radius by 1:

```ts
export function mapRadiusFor(playerCount: number): number {
  if (playerCount === 2) return 7;
  if (playerCount === 3) return 8;
  if (playerCount === 4) return 9;
  throw new Error(`Unsupported player count: ${playerCount}`);
}
```

Update `tests/mapGen.test.ts` line ~7-13: expected radii `7/8/9`.

### 4. Water border ring

In `generateMap`:

- Add `const WATER_BORDER = 1;`
- `const radius = mapRadiusFor(playerCount) + WATER_BORDER;` (so final radii are 8/9/10)
- Generate tiles with `allTiles(radius)` as today.
- After `generateTerrain(...)`, force the outermost ring to water:

```ts
for (const tile of tiles) {
  if (hexDistance({ q: 0, r: 0 }, tile) === radius) {
    tile.terrain = TileType.Water;
  }
}
```

- Village placement constraint stays `distance <= radius - 2`, keeping settlements clear
  of the forced border.
- The water/mountain ratio test samples **wild tiles excluding the forced border ring** so
  it still validates natural terrain. Update `tests/mapGen.test.ts` (~line 57-79) to filter
  out tiles where `hexDistance({q:0,r:0}, t) === radius`.

## Files touched

- `src/game/mapGen.ts`
- `src/controller/gameController.ts`
- `tests/mapGen.test.ts`

## Testing

- `npm run typecheck` passes.
- `npm test` passes with updated expectations.
- Manual: start a game — your starting warrior is selected and highlighted; map is larger
  and fully ringed by water; villages are at least 4 apart.
