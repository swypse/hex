# Radial Skill Tree Layout

## Overview

Replace the ring-based skill tree layout with a radial (tidy-tree) layout: skills radiate
outward from the center along rays, and parent→child edges never intersect because each
subtree occupies its own contiguous angular wedge.

## Changes

### Layout algorithm (`src/ui/overlays/SkillTree.ts`)

Replace `ringOrder`/`skillPosition`/`POS` with a radial tree layout computed once at module
load:

1. Build a children map from `SKILLS` parent links. Roots are skills with `parent === null`
   (Climbing, Water, Forestry, Science, Shields).
2. Count the leaves. Walk each root's subtree in order and assign each leaf a unique angle
   `(leafIndex / leafCount) * 2π - π/2` (starting straight up). Assign each internal node
   the **midpoint angle** of its children, so every subtree lies inside one contiguous
   angular interval — guaranteeing no parent→child edge crosses another.
3. Radius = **tree depth** × `RING_SPACING` (roots at `RING_SPACING`, their children at
   `2 * RING_SPACING`). Node screen position = center + `r·(cos θ, sin θ)`.

No changes to skill data, costs, the zoom/pan behavior, or the detail modal. Catapult
(level 1, parent Science) renders at depth 2 next to Geology as a child of Science.

## Tests

- `tests/skillTree.test.ts` (or a small unit test next to it): the layout places every
  child at a strictly larger radius than its parent (radiates outward), and two distinct
  parent→child edges do not cross (checked via the positions that the node coordinates
  imply).
- Existing zoom/pan tests must keep passing.

## Out of scope

- No change to skill definitions, levels, costs, or unlock logic.
- No change to node styling, labels, or the detail modal.
