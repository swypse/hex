# Unit Overlaps Village Name Design

Date: 2026-08-22

## Problem

Village name labels are rendered in the overlay container, which is added to the stage
after the map layer. As a result, the village name text draws on top of a unit standing on
the village, hiding part of the unit art. The unit should instead draw over the label.

## Design

Move village labels out of the overlay into each tile's map-layer `el` container, inserted
below the unit sprite so units render above labels. Territory borders (re-appended last in
`applyTile`) stay on top of both.

### Changes in `src/render/mapRenderer.ts`

1. **`TileView` gains a field:**

```ts
interface TileView {
  ...
  villageLabelEl: Container | null;
  ...
}
```

Initialize it to `null` in `buildTiles`.

2. **Refactor label creation:** change `addVillageLabel(tile, owner, el, world, players)`
   so it builds and returns the label `Container` (with pooled `Text`/`Graphics` children)
   rather than adding it to the overlay and pushing to `overlayItems`. The label el keeps
   its own local children; its position is set by the caller.

3. **Handle labels per-tile in `update()`:** remove the `labels` array. In the tile loop,
   for a tile with an owned, explored village:
   - release the previous `tv.villageLabelEl` if present (remove from `tv.el`, return its
     `Text`/`Graphics` children to the pools, destroy the el),
   - build the new label el,
   - set `el.position.set(p.x, y + hexSize * 0.35)`,
   - insert it into `tv.el` at the unit sprite's child index (or append if no unit):
     `tv.el.addChildAt(el, unitIndex)` where `unitIndex = tv.unitSprite ? tv.el.getChildIndex(tv.unitSprite) : tv.el.children.length`.
   For any other tile (no owned village, unexplored, or no settlement), remove/release any
   existing `tv.villageLabelEl`.

4. **Overlay cleanup:** `releaseOverlay()` no longer handles labels (labels are released
   manually per-tile). HP bars and exclamations stay in the overlay.

### Result

- A unit sprite on a village draws on top of the village name (unit index > label index).
- Territory borders still render on top (re-appended last in `applyTile`).
- Village labels now scale with the map zoom (previously zoom-independent) — the tradeoff
  approved in brainstorming.

## Files touched

- `src/render/mapRenderer.ts`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass.
- Manual: place a unit on a village — the unit art covers the village name; labels scale
  with zoom; HP bars and exclamation markers still render above.
