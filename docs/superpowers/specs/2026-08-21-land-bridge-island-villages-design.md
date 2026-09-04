# Land Bridge for Stranded Island Villages Design

Date: 2026-08-21

## Problem

After terrain generation and water-border ring placement, a village can end up stranded on
a small island: the village tile and its entire ring-1 are non-water, while the entire
ring-2 is water. Such a village has no land connection to the mainland, which degrades map
quality and gameplay.

## Design

### Trigger condition

For every settlement (owned capitals and free villages alike), after the map is generated:

- All tiles at hex distance `<= 1` from the settlement are non-water (village + ring-1 land)
- **AND** all tiles at hex distance `2` from the settlement are water

When both hold, the village is a stranded island.

### Bridge building (single-tile path)

1. **Find the nearest outside land:** BFS over water tiles, seeded from the settlement's
   ring-1 tiles. Each step moves to a water neighbor. The first non-water tile reached at
   distance `>= 2` is the target (the nearest land not part of this village's island).
   Because ring-2 is all water, the target is guaranteed to be at distance `>= 3`, so the
   bridge will be at least one water tile long.
2. **Reconstruct the path** from the ring-1 edge to the target.
3. **Convert every water tile on the path** to `BIOME_LAND[tile.biome!]`, so bridge terrain
   matches the natural biome pattern used elsewhere.

### Placement in `generateMap`

- The water-border ring (`hexDistance === radius → Water`) is applied first, so the forced
  border counts as water for the island check.
- Settlements are placed and their radius-1 territory is claimed and converted to land
  (`claimTileForVillage` + `BIOME_LAND` at lines ~143-154).
- The bridge conversion runs **after** settlement placement, so ring-1 tiles are guaranteed
  land (they were just converted), and the bridge does not disturb village placement or
  ownership. It only mutates `terrain` on water tiles along the path; `ownedBy`/claims are
  untouched.
- Edge case: a village adjacent to the forced border ring routes its BFS inland, since the
  border is all water, so the bridge always finds real mainland.

## Files touched

- `src/game/mapGen.ts` — new `ensureVillageLandConnection` helper (or inline loop) called
  from `generateMap`
- `tests/mapGen.test.ts` — new tests

## Testing

- New test: for every settlement, if ring-2 is entirely water then there exists a non-water
  tile reachable at distance `>= 2`, and the path is connected.
- New regression: a fixed seed that previously produced an island now produces a map where
  every settlement has a land connection.
- Existing suite (270 tests) and `npm run typecheck` pass.
