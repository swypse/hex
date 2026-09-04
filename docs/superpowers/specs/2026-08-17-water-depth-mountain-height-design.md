# Design: Prism wall hull fix + water depth and mountain height

Date: 2026-08-17

## Goal

Fix a rendering bug in the isometric prism walls (gaps appear at large heights) and increase terrain relief so that:
1. Mountains protrude upward more strongly.
2. Water reads as a visible depression — recessed below the surrounding ground — so the side faces (walls) of the adjacent land/mountain tiles are clearly visible around water bodies.

This is a purely visual change to the prism texture generation. All game logic, clicks, camera, and pan behavior stay unchanged.

## Current behavior and the bug

- `TERRAIN_HEIGHT` (`src/game/tileTypes.ts`) holds a per-terrain height as a fraction of hexSize. The user has already set: Land/Sand/Snow/Forests/Settlement `0.2`, Water `0`, Mountain `1`.
- `makeHexTexture` (`src/render/textureFactory.ts`) builds each tile texture as a prism:
  - If `height > 0`: the wall silhouette is the **full hexagon shifted down** by `height` px, filled with `shadeColor(fill, 0.55)` + dark outline; then the gradient top face is drawn at the grid center on top.

**Bug:** the hexagon's vertical half-extent is `hexSize * HEX_TILT` (= 28 px at hexSize 40). When `height` exceeds `hexSize * HEX_TILT` (= 28 px), the shifted wall's upper side vertices drop below the face's lower side vertices, leaving a **visible gap** between the wall and the top face along both lower diagonal sides. With `Mountain: 1` → `height = 40 px`, the gap is ~12 px and clearly visible.

Root cause: drawing the wall as a *translated copy* of the hexagon does not keep it attached to the face when the translation exceeds the hexagon's half-height.

## Design

### 1. Hull-polygon wall in `makeHexTexture` (`src/render/textureFactory.ts`)

Replace the translated-hexagon wall with a **hull polygon** that connects the top face's upper vertices to the base's lower vertices. For a height `h`, hexSize `s`, tilt `t = HEX_TILT`, the wall silhouette is the 6-point polygon:

```
(0, -s·t + min(0, h))
(√3/2·s, -½·s·t + min(0, h))
(√3/2·s, ½·s·t + max(0, h))
(0, s·t + max(0, h))
(-√3/2·s, ½·s·t + max(0, h))
(-√3/2·s, -½·s·t + min(0, h))
```

In code, using the existing `hexagonPoints` shape, build the wall points by combining the face's upper edge with the base's lower edge. `hexagonPoints` returns a flat array ordered `[UR, LR, B, LL, UL, T]` (upper-right, lower-right, bottom, lower-left, upper-left, top) with y already × `HEX_TILT`:

```ts
function makeHexTexture(app, fill, hexSize, height = 0, bottom = fill) {
  const g = new Graphics();
  if (height !== 0) {
    const face = hexagonPoints(hexSize); // flat [x0,y0, x1,y1, ...]
    const wallPoints = [
      face[10], face[11] + Math.min(0, height),   // top (raised up for pits)
      face[0], face[1] + Math.min(0, height),     // upper-right (raised up for pits)
      face[2], face[3] + Math.max(0, height),     // lower-right → base
      face[4], face[5] + Math.max(0, height),     // bottom → base
      face[6], face[7] + Math.max(0, height),     // lower-left → base
      face[8], face[9] + Math.min(0, height),     // upper-left (raised up for pits)
    ];
    g.poly(wallPoints).fill(shadeColor(fill, 0.55)).stroke({ width: 2, color: 0x000000 });
  }
  // ... gradient top face drawn at grid center, unchanged ...
}
```

Notes:
- For **positive heights**: the top half of the polygon comes from the face (at y ≈ 0), the bottom half extends down by `height`. The wall is always attached to the face — no gap at any height.
- For **negative heights** (water): the upper half is raised by `height` (i.e., up-screen), producing the **pit walls** above a sunken face; `max(0, height)` = 0 so the lower edge stays at the face.
- For `height = 0`: no wall is drawn (flat tile) — unchanged.
- The wall fill factor (`0.55`), dark outline, and gradient face are unchanged.

**Anchor:** with this construction the wall never changes the face's own position, so the existing anchor math is preserved. For the negative branch, extend the existing formula so the **face center** stays at the grid point:

```
wallExtent = Math.abs(height)
textureHeight = 2 * hexSize + wallExtent
anchorY = hexSize / textureHeight
```

(`Math.abs` because for pits the wall extends up-screen, but the face stays centered; the existing `2 * hexSize + height` formula already handles the positive case, and this generalizes it.)

### 2. Height values (`src/game/tileTypes.ts`)

The user has already set the desired values:
- Mountain: `1` (tall, strongly protruding).
- Land/Sand/Snow/Forests/Settlement: `0.2`.
- Water: `0`.

These stay as-is. The hull fix makes large heights (like Mountain `1`) render correctly without gaps. `TERRAIN_HEIGHT` may be negative in the future for deeper water; the wall code already supports it.

### 3. Unchanged

- `hex.ts`, `zoom.ts`, `gameController.ts`, `mapRenderer.ts` — untouched. The sprite is still placed at the grid point, so clicks, units, villages, labels, and camera math are unaffected.
- Gradient range, wall shading factor, water `bottom` darkening — unchanged.

## Files touched

- `src/render/textureFactory.ts` — hull-polygon wall in `makeHexTexture` (positive + negative heights), anchor formula generalization.
- `src/game/tileTypes.ts` — no change needed (values already set by the user).
- `tests/tileTypes.test.ts` — the existing sanity test asserts water = 0 (still true) and mountain = max (still true), so it remains valid as-is.

## Testing

- Typecheck + full suite (`npm test`).
- Manual via `npm run dev`: mountain prisms render with no gap between wall and face; water flat; walls of raised tiles visible against neighbors; clicks/camera/pan behave as before.
- Edge check: temporarily set a very large height (e.g., `Mountain: 2`) and confirm no gap appears; then restore.

## Out of scope

- Changing the hex/tile/camera logic.
- Squashing or otherwise altering units, labels, or HP bars.
- Adding true elevation data or terrain transitions (neighbor-aware cliffs).
- Negative water height (deeper recess) in this iteration — the wall code supports it, but water stays `0` per the user's current settings.
