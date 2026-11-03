# Design: Natural biome map generation

Date: 2026-08-18

## Goal

Replace the current random (weighted-pick) terrain assignment with a natural, noise-driven generator:

- Height map from Perlin noise → water (lowest 15%) and mountains (highest 10%).
- Temperature and rain maps from two more Perlin noises.
- Biomes derived from temperature × rain (Whittaker-style 2-axis classification).
- Per-biome terrain types (land, forest, mountain), single water type.
- Per-tile height / temperature / rain / biome data stored for future use (e.g., biome-name display).
- Per-biome display names (`BIOME_NAMES`).

## Background

Current generation (`src/game/mapGen.ts`) assigns terrain per tile via `rng.pick(TERRAIN_TYPES)` or `rng.pick(WEIGHTED_TERRAIN)`, producing random, unnatural maps. The existing tile set is terrain-based (`Land`, `Sand`, `Snow`, `ForestLand`, `ForestSand`, `ForestSnow`, `Water`, `Mountain`, `Settlement`).

## Design decisions (confirmed with user)

1. **Classification**: classic 2-axis Whittaker scheme — temperature (cold/normal/warm) × rain (dry/normal/wet).
2. **Tile naming**: uniform per-biome names, e.g. `GrasslandLand`, `DesertForest`, `TundraMountain`; old names (`Sand`, `Snow`, `ForestLand`, ...) are removed — their visuals become colors on the new names.
3. **No cleanup pass**: Perlin's natural clustering is accepted as-is; no small-region flood-fill cleanup.
4. **Per-tile data**: store `biome`, `temperature`, `rain`, `height` on every `MapTile`.
5. **Village override**: after generation, the village tile and its radius-1 claimed neighbors are forced to the biome's **land** type (walkable start + income area).
6. **Forest placement**: within each biome, tiles with rain above the biome's median become forest.

## 1. Tile types & biome data model

### `TileType` (`src/game/tileTypes.ts`) — 17 entries

| Biome | Land | Forest | Mountain |
|---|---|---|---|
| Grassland | `GrasslandLand` | `GrasslandForest` | `GrasslandMountain` |
| Desert | `DesertLand` | `DesertForest` | `DesertMountain` |
| Tundra | `TundraLand` | `TundraForest` | `TundraMountain` |
| Taiga | `TaigaLand` | `TaigaForest` | `TaigaMountain` |
| Rainforest | `RainforestLand` | `RainforestForest` | `RainforestMountain` |

Plus `Water` and `Settlement` (unchanged). `ALL_TILE_TYPES` grows to 17. `WEIGHTED_TERRAIN` and `TERRAIN_TYPES` are removed.

### `src/game/biomes.ts` (new)

- `enum Biome { Grassland, Desert, Tundra, Taiga, Rainforest }`
- `BIOME_NAMES: Record<Biome, string>` — `'Grassland'`, `'Desert'`, `'Tundra'`, `'Taiga'`, `'Rainforest'` (displayed later).
- `BIOME_LAND / BIOME_FOREST / BIOME_MOUNTAIN: Record<Biome, TileType>` — mapping table above.

### Terrain classification helpers (`tileTypes.ts`, pure)

`isForestType(terrain)`, `isMountainType(terrain)`, `isLandType(terrain)`, `isWaterType(terrain)` — so `capture.ts` no longer hardcodes forest/mountain names.

### Colors / heights / names

- All land/forest: height `0.2`; all mountains: `1`; water: `0`; settlement: `0.2`.
- Desert land keeps the sand color (`0xe0c068`), tundra land the snow color (`0xf2f2f7`), grassland land the green (`0x4c9a3d`); each biome's forest/mountain gets a tinted variant (e.g., `DesertMountain` sandy gray, `RainforestForest` deep green).
- `TILE_TYPE_NAMES` has a display name for each of the 17 types.
- `textureFactory.ts` iterates `TILE_TYPE_COLORS`, so the new types are picked up with no code change.

## 2. Perlin noise & pipeline

### `src/game/perlin.ts` (new, no dependency)

- `makePermutation(seed)` — 256-entry permutation table built from `SeededRandom`.
- `perlin2(perm, x, y)` → `[-1, 1]`, wrapped to `[0, 1]`.
- `createPerlin(seed): (x, y) => number`.

### Sampling

Each hex is sampled at its world position `hexToPixel(h, 1)` (axial→pixel mapping is linear), scaled by frequency. Three independent noises derived from the master seed with offsets:

- **height** — freq `0.15`
- **temperature** — freq `0.08`
- **rain** — freq `0.10`

### `generateTerrain(tiles, seed)` (in `biomes.ts`, pure)

For every tile: sample all three noises, store `height` / `temperature` / `rain` on the tile, then classify (Section 3). Deterministic for a fixed `seed`.

## 3. Terrain assignment & thresholds

### `biomeFor(temperature, rain)`

```
temperature < 0.45  →  rain < 0.45 ? Tundra : Taiga
temperature > 0.55  →  rain < 0.45 ? Desert : Rainforest
otherwise           →  Grassland
```

Thresholds are named constants (tunable).

### Height → water/mountain

1. Collect all tile heights.
2. `waterThreshold` = 15th percentile of heights → heights `< waterThreshold` → water.
3. `mountainThreshold` = 90th percentile → heights `≥ mountainThreshold` → mountain.

### Forest vs. plain land

Per biome, compute the median rain over that biome's non-water, non-mountain tiles; tiles with rain above the median → the biome's forest type, otherwise the biome's land type.

### Per-tile terrain result

```
height <  waterThreshold     → Water
height >= mountainThreshold  → BIOME_MOUNTAIN[biome]
rain >= biome median rain    → BIOME_FOREST[biome]
else                         → BIOME_LAND[biome]
```

### Village override

After villages are placed and claimed, the village tile and its radius-1 neighbors are forced to `BIOME_LAND[biome]` of their own biome. Water/mountain tiles can still be claimed further out (mountain income works via `isMountainType`).

## 4. Integration & code changes

- **`MapTile`** (`mapGen.ts`): add `biome: Biome`, `temperature: number`, `rain: number`, `height: number`.
- **`mapGen.ts`**: call `generateTerrain(tiles, seed)` after tile creation (spawn logic is position-only, unaffected); delete the trailing `rng.pick(TERRAIN_TYPES)` / `rng.pick(WEIGHTED_TERRAIN)` block; run the village override after claims are set.
- **`capture.ts`**: `tileResourceYield` → `isForestType` (wood) / `isMountainType` (stone).
- **`selection.ts`, `combat.ts`**: unchanged (`TileType.Water` still exists).
- **`mapRenderer.ts`, `textureFactory.ts`**: unchanged code.
- **`gameController.ts`, `ai.ts`, `spawn.ts`, etc.**: untouched.

## Testing

- `tileTypes.test.ts` — 17 types; drop `TERRAIN_TYPES`/`WEIGHTED_TERRAIN` assertions; `TERRAIN_HEIGHT`: water `0`, mountains `1` (max), all `≥ 0`.
- `mapGen.test.ts` — "settlement on land" checks `isLandType`; add water ≈ 15% and mountain ≈ 10% (tolerance); every tile has a `biome`; village area is all-land; determinism unchanged.
- New `biomes.test.ts` — `biomeFor` covers all 5 cases, mappings are valid tile types, `generateTerrain` deterministic.
- New `perlin.test.ts` — same seed → same output, range `[0,1]`, different seeds diverge, neighbors are close (smoothness).
- Full suite: `npm test` + `npm run typecheck`.

## Out of scope

- Biome-name display in UI (data + `BIOME_NAMES` only, display later).
- Post-processing cleanup of isolated single tiles.
- Height-dependent temperature (mountains colder).
- Water depth variation.
- Tribal biome affinities, skill-tree interactions, or resource balancing per biome.
