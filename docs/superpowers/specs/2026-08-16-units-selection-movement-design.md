# Design: Units, selection, and movement

Date: 2026-08-16

## Goal

Add units to the map (one warrior in each owned village), click-based selection with priority cycling (unit → village → terrain), blurred glow halos on selected content, move-target highlighting for the human's unmoved units, and click-to-move. Units always render above terrain and village.

## Requirements (from discussion)

- Each owned village (owner !== null) starts with a warrior unit owned by that player. Free villages have no unit.
- Unit texture: small red circle, drawn over terrain and village so always visible.
- Clicking a hex selects content by priority: unit → village → terrain. Clicking the same tile again cycles down through present layers; clicking a different tile resets to that tile's highest priority.
- Selected terrain/village/unit gets a blurred halo glow. Halo color: tribe color for units/villages (neutral free village = gray), white for terrain.
- When a human's unmoved unit is selected, reachable tiles are highlighted with a semi-transparent ghost of the unit texture.
- Reachable = tiles within the unit's movement distance (warrior = 1), excluding water and tiles occupied by another unit. Villages are allowed if no unit on them.
- Only the human's units can be moved. AI/neutral content shows glow but no move targets.
- A moved unit cannot move again (hasMoved flag; turn system comes later).
- Click on a reachable target moves the unit to that tile.

## Model changes

### units.ts (new)

```ts
type UnitType = 'warrior';
interface Unit {
  id: string;
  owner: number;
  type: UnitType;
  q: number;
  r: number;
  hasMoved: boolean;
}
const UNIT_MOVEMENT: Record<UnitType, number> = { warrior: 1 };
```

### mapGen.ts

- `MapTile` gains `unit: Unit | null`.
- After placement, every owned settlement tile gets `unit = { id, owner, type: 'warrior', q, r, hasMoved: false }` (deterministic ids, e.g. `w0`, `w1`, ...).
- `GameMap` unchanged otherwise.

### hex.ts

- Add `pixelToHex(x, y, hexSize): Axial` (inverse of existing `hexToPixel`), and a rounding step to the nearest hex.

## Selection & movement logic (pure, unit-testable) — selection.ts (new)

```ts
type SelectionKind = 'unit' | 'village' | 'terrain';
interface Selection {
  kind: SelectionKind;
  q: number;
  r: number;
}

function contentLayers(tile: MapTile): SelectionKind[]  // ['unit','village','terrain'] filtered by what exists, highest priority first
function cycleSelection(current: Selection | null, tile: MapTile): Selection
function tileAt(map: GameMap, q: number, r: number): MapTile | undefined
function reachableTargets(map: GameMap, unit: Unit): MapTile[]  // within UNIT_MOVEMENT, non-water, no unit
function moveUnit(map: GameMap, unit: Unit, target: MapTile): void  // sets unit.q/r, target.unit, source.unit=null, unit.hasMoved=true
```

## Rendering changes

- `TextureSet` gains: `unitTexture` (red circle, ~0.2×hex radius), `glowTextures` (blurred halo per tribe color + white + gray, generated with a `BlurFilter`).
- `renderMap` builds, per tile, bottom→top: terrain sprite → village sprite → unit sprite → (selected halo) → (ghost markers for reachable tiles when a human unit is selected).
  - Halo color: unit/village → owner tribe color (neutral village → gray); terrain → white.
  - Ghost: `unitTexture` sprite at ~0.5 alpha on each reachable tile.
- `renderMap` signature extended to accept a `Selection | null`, a `reachableTargets` set, and `players` (to map owner → tribe color for halos). Keeps full-rebuild-on-change approach (91 tiles max — trivial).

## Interaction (gameScreen.ts)

1. PixiJS `pointertap` on the map container; convert to pixel → `pixelToHex`.
2. `tileAt` lookup; ignore if outside map.
3. `cycleSelection` with the clicked tile.
4. If a human unit is selected, unmoved, and the clicked tile is in `reachableTargets` → `moveUnit`, clear selection, re-render.
5. Re-render map container on any state change.

## Tests

- `pixelToHex`/`hexToPixel` round-trip.
- Content layer priority & cycling (unit→village→terrain, reset on different tile).
- `reachableTargets`: excludes water, excludes occupied tiles, includes empty villages, distance respects UNIT_MOVEMENT.
- `moveUnit`: updates positions, clears source, sets `hasMoved`.
- Map gen: every owned village has a warrior unit; free villages have none.
