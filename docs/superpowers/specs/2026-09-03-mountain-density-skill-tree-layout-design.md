# Mountain density halving & symmetric skill tree layout

Date: 2026-09-03

Two independent gameplay/UI refinements:

1. Generate ~2x fewer mountains on the map (~20% -> ~10% of tiles).
2. Redistribute the skill tree circles so the branches are symmetric and evenly
   distributed around the wheel.

## Change 1: Halve mountain density

### Problem

Terrain generation currently makes the top ~20% of height values mountains
(`mountainThreshold = percentile(heights, 0.8)`), which reads as too much
mountains on the map.

### Design

- `src/game/biomes.ts` (`generateTerrain`): change the mountain threshold from
  `percentile(heights, 0.8)` to `percentile(heights, 0.9)`, so the top ~10% of
  tiles become mountains.
- Water threshold (`0.4`) and the forest/land rain split are untouched.
- `ensureResourceNearVillage` in `src/game/mapGen.ts` is untouched: it already
  converts a nearby land tile to mountain/forest when a village has none within
  distance 2, so every village keeps its guaranteed mountain and forest.

### Test and doc updates

- `tests/biomes.test.ts`: the "roughly 40% water and 20% mountains" case ->
  rename to ~10% mountains and set the `mountain` band to about half of the
  previous range (~0.07-0.13). Both suites are deterministic (fixed seeds), so
  after the change run once, read the actual ratio, and pin a tight band around
  it if it falls outside that range.
- `tests/mapGen.test.ts`: the "roughly 40% water and 20% mountains away from
  villages" case -> same handling for the wild-tile mountain ratio (still aimed
  at ~10%; note `ensureResourceNearVillage` may add a few mountains within the
  wild radius-2 fringe, so pin the band from the deterministic run).
- `GAME.md` Map section: "Roughly 40% water, 20% mountains, the rest land and
  forest" -> "Roughly 40% water, 10% mountains, the rest land and forest".
- `tests/mapGen.test.ts` "guarantees a mountain and a forest within distance 2
  of every starting village" must keep passing unchanged (relies on
  `ensureResourceNearVillage`, not on natural density).

### Verification

- `npm test` (biomes, mapGen, buildings, resources suites especially).
- `npm run typecheck`.

## Change 2: Symmetric skill tree layout

### Problem

The radial skill tree in `SkillTree.ts` places leaf circles evenly (every 36°)
and then positions each parent circle at the midpoint of its children's angles.
With six roots whose subtrees have unequal leaf counts
(2, 2, 2, 2, 1, 1) the inner ring ends up uneven: root gaps are
72°/72°/72°/54°/36°/54°, crowding the Science/Shields/Riding side and leaving
the opposite side sparse.

### Design

Rework `skillLayout()` in `src/ui/overlays/SkillTree.ts` to allocate equal
angular sectors per root branch instead of midpoint-ing leaves:

- There are six roots, so each root branch gets a 60° sector
  (`2 * PI / roots.length`).
- A root's angle is the center of its sector.
- Recursively, each node's children evenly subdivide that node's sector; each
  child's angle is the center of its sub-sector.
- Radius stays `depth * RING_SPACING` (`110`), root depth `1`, so the layout
  keeps its existing radial/depth structure and exported
  `Record<SkillId, SkillNodeLayout>` shape (`x`, `y`, `depth`, `radius`).
- Remove the now-unused leaf enumeration / midpoint bookkeeping.

Expected result: six roots evenly spaced every 60°; two-child branches render as
symmetric fans; single-child branches (Shields -> Defence, Riding -> Knights)
point straight outward from the center. Closest angular gap between adjacent
leaf circles is ~30° (chord ~114px at the leaf ring), so circles and their
labels do not overlap.

### Tests

- `tests/skillTreeLayout.test.ts`: existing three assertions must keep passing
  unchanged (child farther than parent, catapult on second ring under science,
  no parent-child edge intersections).
- Add assertions:
  - Every pair of adjacent root angles is ~60° apart.
  - Every child's angle lies inside its parent's sector (and between the
    parent's children's sector bounds).
- `tests/skillTree.test.ts` (zoom/pan smoke tests) must keep passing.

### Verification

- `npm test` (skillTreeLayout, skillTree).
- `npm run typecheck`.

## Out of scope

- No gameplay rule changes (mines, ore economy, climbing) beyond map density.
- No changes to skill costs, unlock rules, or skill data.
- No changes to skill-tree zoom/pan/fit behavior.
