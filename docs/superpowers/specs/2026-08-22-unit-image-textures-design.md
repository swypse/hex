# Unit Image Textures Design

Date: 2026-08-22

## Problem

Units currently render as procedural shapes (circle, square, triangle, and a
circle+triangle swordsman) tinted per tribe. Four new unit images were added to
`public/textures/` (`warrior.png`, `archer.png`, `swordsman.png`, `rider.png`), each the
same 256×448 layout as the tile textures. They should replace the procedural shapes,
tinted per tribe.

## Design

### 1. Load unit images and tint per tribe (`src/render/textureFactory.ts`)

- Add `UNIT_IMAGE_FILES: Record<UnitType, string>` mapping `warrior → warrior.png`,
  `archer → archer.png`, `swordsman → swordsman.png`, `rider → rider.png`.
- In `createTextures`, load the four images via the existing `loadImageTexture`.
- For each tribe × unit type, build the texture like tile textures:
  - Create a `Container`, add `new Sprite(image)` with `sprite.tint = tribe.color`,
    `sprite.anchor.set(0.5, IMAGE_HEX_CENTER_Y / IMAGE_H)`, and
    `sprite.scale.set((Math.sqrt(3) * hexSize) / IMAGE_HEX_W)`.
  - `app.renderer.generateTexture({ target: container })`, then
    `anchorY = IMAGE_HEX_CENTER_Y / IMAGE_H`.
- Change `TextureSet.unitTextures` from
  `Record<Tribe, Record<UnitType, Texture>>` to
  `Record<Tribe, Record<UnitType, TileTexture>>` (matching `tileTextures` shape).
- Delete `makeUnitTexture` (procedural shapes).

### 2. Renderer uses the new anchor (`src/render/mapRenderer.ts`)

- In `applyTile`, the unit texture lookup now returns a `TileTexture`; pass its `anchorY`
  into `syncSprite`.
- `syncSprite` gains an `anchorY` parameter defaulting to `0.5`, used only when creating a
  new sprite: `sprite.anchor.set(0.5, anchorY)`. Village and building sprites continue to
  pass the default.

### 3. Move-animation sprite (`src/controller/gameController.ts` `animateMoveEvent`)

The temporary sprite used during move animation creates `new Sprite(texture)` with
`anchor.set(0.5)`. Update it to use the `TileTexture.anchorY` from
`textures.unitTextures[..][..]`.

## Files touched

- `src/render/textureFactory.ts`
- `src/render/mapRenderer.ts`
- `src/controller/gameController.ts`

## Testing

- `npm run typecheck`, `npm test`, `npm run build` pass.
- Manual: units render as the new art, tinted per tribe; they sit on their tiles using the
  same anchor as tile textures; the move-animation sprite matches.
