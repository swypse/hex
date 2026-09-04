# Design: Village colors and unit outline

Date: 2026-08-16

## Goal

Distinguish villages by ownership and separate unit circles from village circles visually:
- Occupied villages render in their owner's tribe color.
- Unoccupied (free/neutral) villages render gray.
- Unit circles get a permanent black outline so they don't blend into the tribe-colored village circle underneath.

## Background

Currently all villages render as a black circle (`villageTexture`, shared), and units are plain tribe-colored circles with no outline.

## Changes

### textureFactory.ts

- Replace `villageTexture: Texture` in `TextureSet` with:
  - `villageTextures: Record<Tribe, Texture>` — tribe-colored circles (occupied villages).
  - `freeVillageTexture: Texture` — gray circle (0x9a9a9a) for unoccupied villages.
- `makeUnitTexture` adds a black stroke to the circle: `g.circle(...).fill(color).stroke({ width: 3, color: 0x000000 })`.

### mapRenderer.ts

- Village sprite branch picks the texture by `tile.settlement.owner`:
  - `owner === null` → `freeVillageTexture`
  - `owner !== null` → `villageTextures[players[owner].tribe]`

## Tests

No unit tests needed — texture/render changes verified manually via headless screenshot (tribe-colored villages present, gray free villages present, unit circles show black outline).
