# Design: Zoom-independent HP bars and village labels

Date: 2026-08-18

## Goal

HP bars (with their `hp/maxHp` text) and village name labels must keep a **constant on-screen size** regardless of the current zoom level, while remaining **anchored to their world position** — they stay glued to their unit/village and follow the camera as it pans and zooms.

## Background (current behavior)

- `GameController` (`src/controller/gameController.ts`) owns the Pixi app, the map container, and `zoom`/`pan` state. `HEX_SIZE = 40`.
- `applyTransform()` is the single choke point for camera changes: it sets `mapContainer.scale = baseScale * zoom` and `mapContainer.position = pan`. It is called on every pan frame (drag, inertia), zoom step, camera animation, reset, and fit-to-screen.
- `renderMap` (`src/render/mapRenderer.ts`) builds a single world-space `Container` containing terrain, settlements, units, territory borders, highlights, HP bars, and village labels. Because the whole container is scaled by `baseScale * zoom`, the bars and labels grow/shrink with zoom.
- Zoom range is `[0.5, 2]` relative to the fit-to-screen `baseScale`.
- A previous change moved village labels into a separate `labels` container that is the last child of the world container, so labels already render on top of all tiles.

## Design

Split rendering into two layers returned by `renderMap`:

```
RenderedMap = {
  container: Container,   // world-space: terrain, villages, units, territory, highlights (scales with zoom)
  overlay: Container,     // screen-space: HP bars + village labels (always scale 1)
  overlayItems: OverlayItem[],  // { el: Container; world: { x, y } } for repositioning
}
```

- `overlay` is a sibling of the world container added to `app.stage` last, so it draws on top of all map content. It keeps the default `eventMode: 'none'`, so pointer/wheel events pass through to the map container.
- Each HP bar and each village label is built as a wrapper `Container` `el` (bar bg, hp fill, hp text, text bg for bars; black bg + text for labels) added to `overlay`. Its world anchor is recorded in `overlayItems`.
- `GameController.applyTransform()` recomputes each element's screen position after applying the camera transform:
  `el.position = (pan.x + world.x * scale, pan.y + world.y * scale)`.
  Since every pan/zoom/camera change funnels through `applyTransform`, elements always track their world position at constant size.

### `src/render/mapRenderer.ts`

- Add types `OverlayItem` and `RenderedMap`; `renderMap` returns `RenderedMap` instead of a bare `Container`.
- `addHpBar` changes from adding children directly to the world container to building a wrapper `el`, adding it to `overlay`, and pushing `{ el, world: position }` to `overlayItems`. Bar geometry stays in local (screen) units: `barWidth = hexSize * 0.6`, offset `y - hexSize * 0.6`, font size 10.
- The village-label block does the same: wrapper `el` at world anchor `(p.x, y + hexSize * 0.35)` containing the black semi-transparent bg and the text.
- The `labels` container from the earlier fix is removed; its role is absorbed by `overlay`.

### `src/controller/gameController.ts`

- New fields: `overlay: Container | null`, `overlayItems: OverlayItem[]`.
- In `render()`: remove the previous overlay from the stage if present, rebuild both layers via `renderMap`, then `app.stage.addChild(overlay)` after the map container.
- In `applyTransform()`: after setting `mapContainer` scale/position, iterate `overlayItems` and set each `el.position` from its world anchor and the current scale/pan.
- `destroy()` resets overlay fields.

## Files touched

- `src/render/mapRenderer.ts` — new return type, overlay layer, `addHpBar` rework.
- `src/controller/gameController.ts` — overlay fields, render/transform wiring, destroy cleanup.

## Testing

- Typecheck (`npm run typecheck`) and existing tests (`npm test`, 158 passing) must stay green.
- No automated render tests exist (rendering is not unit-tested in this project); this is a visual change.
- Manual via `npm run dev`: zoom in/out with the wheel and pan — HP bars and village labels stay the same on-screen size while staying attached to their units/villages; clicks and wheel still hit the map (overlay does not block input).
