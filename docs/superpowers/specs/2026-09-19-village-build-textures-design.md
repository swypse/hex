# Villagers Composite Village Textures

## Goal

Add a texture build system for villages: a village is drawn as a composite of stacked block
tiles taken from the `village-villagers-atlas.png`. The composite grows one block per column
per village level. The system is used **only** for the Villagers tribe right now; every other
tribe keeps its existing per-tribe village texture.

## Background / current behavior

- `villageTextureFor` (`src/render/village-texture.ts`) returns one `TileTexture` per
  settlement: the free-village texture when unowned, otherwise the owner tribe's
  `level1`/`level2` village texture. `map-renderer.ts` places it as the single `villageSprite`
  anchored at the hex center.
- `public/textures/village-villagers-atlas.png` (packed by `npm run pack:village-villagers`
  from `src/assets/village-villagers/*.png`) holds six 70×52 frames:
  `villagers-l-m1`, `villagers-l-m2`, `villagers-l-t1`, `villagers-r-m1`, `villagers-r-m2`,
  `villagers-r-t1` (manifest in `src/game/village-villagers-atlas-data.gen.ts`).
- All village upgrades flow through `upgradeVillage(map, tile)` (`src/game/village.ts`),
  called from `simulator.doUpgradeVillage` and the free-upgrade bonus. `Settlement`
  (`src/game/map-gen.ts`) carries `{ owner, level, captureReady, ... }` and is serialized
  through save/multiplayer as-is.
- `tileSignature` (`src/render/tile-signature.ts`) already includes the settlement owner and
  level, so a level change re-runs `applyTile`.

## Architecture

Lazy-bake one composite texture per distinct look, cached; the map renderer keeps using the
existing single `villageSprite`. A `VillageBuildTextureService` holds the `Application` and
`hexSize`, slices frames from the village-villagers atlas, and bakes + caches composites.

## Changes

### 1. Game state — `SettlementBuild` (map-gen.ts)

```ts
export type VillageBlockVariant = 'm1' | 'm2';

/** Below-top block variants per column, top-down. Column order: l[0..2] are
 *  left columns 1–3, r[0..3] right columns 1–4, lBack[0..2] the three
 *  left-back columns, rBack[0..1] the two right-back columns. Each inner
 *  array is as long as its column's below-top block count at the current
 *  level (see `villageColumnMiddleCount`). The back arrays are absent on
 *  records created before back columns existed; the whole record is absent
 *  for level-1 villages and older saves. */
export interface SettlementBuild {
  l: VillageBlockVariant[][];
  r: VillageBlockVariant[][];
  lBack?: VillageBlockVariant[][];
  rBack?: VillageBlockVariant[][];
}
```

`Settlement` gains `build?: SettlementBuild`.

### 2. Rolling at upgrade — village.ts

`upgradeVillage(map, tile, roll: () => number = Math.random)`:

- On entry, `settlement.level++`.
- Lazily create `settlement.build = { l: [[],[],[]], r: [[],[],[],[]], lBack: [[],[],[]], rBack: [[],[]] }`
  when absent.
- For each of the 12 columns, "top up" its variant array to its target length
  `villageColumnMiddleCount(side, column, level)` by appending one of `'m1' … 'm4'`
  (`['m1','m2','m3','m4'][floor(roll()·4)]`).
  Topping-up (appending only, never shrinking) is robust to legacy/mismatched state, e.g. a
  settlement created directly at a higher level or upgraded under the older single-count rule.
- `simulator.doUpgradeVillage` and the `villageUpgrade` bonus pass `this.rng` so multiplayer
  stays host-snapshot consistent; other callers use the default.

Choices are stored on the `Settlement`, so they persist through save/reload, capture
(capturing only rewrites `owner`), and host snapshots in multiplayer. A captured Villagers
village that is later re-captured by Villagers keeps its original look.

### 3. Composite geometry — pure layout function

Constants: `BLOCK_W = 70`, `BLOCK_H = 52`, vertical step `52 - 25 = 27`,
composite width `240` (x 0 → 170 + 70). Columns are **ground-anchored**: a
column's bottom block always rests with its bottom at `colY + 52`, so adding
blocks makes a column rise instead of sink. The composite therefore spans
from the top of the highest-reaching column to `max(colY) + 52` (the lowest
ground line, r1 at y=30): `height = max(colY) + 52 − min(colY − (blocks − 1)·27)`.

Per-column block counts (pure rule, shared by game logic and renderer —
`src/game/village-build.ts`):

- Short columns (`l1`, `r4`, all 5 back columns) have `ceil(level / 2)` blocks.
- Tall columns (`l2`, `l3`, `r1`, `r2`, `r3`) have `ceil(level / 2)` blocks
  plus one more on even levels.
- Level 1 → every column 1 block; level 2 → tall columns gain a 2nd block
  (they rise 27px above their neighbors, bottoms stay); level 3 → every
  column gains a 2nd; level 4 → tall columns gain a 3rd; and so on.

Composite height by level: 1/2 → 112, 3/4 → 139, 5/6 → 166 (the back
columns are top-most, so height grows on odd levels when they grow).

Column anchors (`x, y` — `y` is the **ground line**, i.e. the top of the
bottom block of a 1-block column) and draw order (back → front). The five
back columns always draw `villagers-r-*` frames; horizontal ties keep right
columns in front of left columns:

| order | column           | x   | y   | top frame       | middle frames (top-down) |
|-------|------------------|-----|-----|-----------------|--------------------------|
| 1     | lBack 3          | 95  | -30 | r-t1            | r-m1 / r-m2              |
| 2     | lBack 2          | 70  | -20 | r-t1            | r-m1 / r-m2              |
| 3     | rBack 1          | 120 | -20 | r-t1            | r-m1 / r-m2              |
| 4     | lBack 1          | 45  | -10 | r-t1            | r-m1 / r-m2              |
| 5     | rBack 2          | 145 | -10 | r-t1            | r-m1 / r-m2              |
| 6     | l1               | 0   | 0   | l-t1            | l-m1 / l-m2              |
| 7     | r4               | 170 | 0   | r-t1            | r-m1 / r-m2              |
| 8     | l2               | 25  | 10  | l-t1            | l-m1 / l-m2              |
| 9     | r3               | 145 | 10  | r-t1            | r-m1 / r-m2              |
| 10    | l3               | 50  | 20  | l-t1            | l-m1 / l-m2              |
| 11    | r2               | 120 | 20  | r-t1            | r-m1 / r-m2              |
| 12    | r1               | 95  | 30  | r-t1            | r-m1 / r-m2              |

- Block `i` of a column (i = 0 is the top) sits at `y = colY + (i − (blocks − 1)) · 27` — the
  stack grows upward from the ground; the upper block overlaps the block below it by 25px and
  renders above it (drawn later).
- Middle block `j` (frame from `build[side][col][j]`, `'m1'` fallback when missing) is block
  `i = j + 1` of its column (directly under the top is j = 0).

Expose this as a pure, unit-testable function, e.g.
`villageBuildFrames(level, build): { frames: {frameKey, x, y}[]; width; height }`.

### 4. Atlas loading — new file `src/render/village-build-atlas.ts`

Mirror `src/render/buildings-atlas.ts`: load `village-villagers-atlas.png` once
(`ensureVillageVillagersAtlas()`), slice frames by `VILLAGE_VILLAGERS_ATLAS_FRAMES`
(`villageVillagerFrameTexture(frameKey)`), share a single load promise, return `Texture | null`
and degrade gracefully on load failure.

### 5. Compositing & baking — new file `src/render/village-build-texture.ts`

- `VillageBuildTextureService(app: Application, hexSize: number)`:
  - `ensureLoaded(): Promise<void>` — loads the atlas.
  - private cache `Map<string, TileTexture>` keyed by `` `${level}|${signature}` `` where the
    signature joins the 12 variant arrays (e.g. `l1:m2,l1:m1|...`).
  - `tileTexture(settlement): TileTexture | null` — resolves variants (m1 fallback), bakes a
    composite, caches and returns it; `null` when the atlas failed to load.
- Baking: build a `Container` with `sortableChildren = true`; for each frame of
  `villageBuildFrames(level, build)` add a `Sprite(frameTex)` with
  `scale = √3 · hexSize / 240` at `(x · scale, y · scale)` and `zIndex = draw order index`
  (so upper blocks and front columns render on top regardless of paint order).
  `app.renderer.generateTexture({ target: container, resolution: 1 })`, destroy children, and
  return `{ texture, anchorY }` — the composite is scaled so its 240px width equals the
  hex width. `anchorY = villageBuildAnchorY(height) = 1 − 56/height` pins the composite
  bottom (which is level-independent: every column rests on its own ground line, the lowest
  being r1 at `30 + 52`) at a fixed 56px below the hex center (the `(p.x, y)` anchor point of
  every tile sprite) — the same offset as the level-1 centered look. So a village's bottom
  never moves relative to the hex as it levels up; only its top rises.

### 6. Integration

- `texture-factory.ts` `TextureSet` gains `villageBuild: VillageBuildTextureService`. In
  `createTextures`, construct `new VillageBuildTextureService(app, hexSize)`, `await
  ensureLoaded()`, and include it in the returned set.
- `village-texture.ts`: `villageTextureFor(settlement, textures, tribe, villageBuild?)` —
  when `tribe === Tribe.Villagers` and `villageBuild?.tileTexture(settlement)` returns a
  texture, use it; otherwise keep the existing resolution path exactly as today. The optional
  4th parameter keeps existing unit tests valid (they pass no service).
- `map-renderer.ts` (applyTile): pass `this.textures.villageBuild` to `villageTextureFor` —
  no other renderer changes. The composite re-bakes automatically when a village levels up,
  because `tileSignature` includes the level and the service cache keys on level + variants.

### 7. Non-goals / invariants

- No changes for non-Villagers tribes, free villages, or the fog/wall/building sprites.
- The z-index/anchor conventions for other sprites are untouched; the composite only swaps
  the texture for the existing `villageSprite`.
- No new assets are added; the existing `village-villagers-atlas.png` is the only source.

## Error handling

- Atlas load failure → `villageVillagerFrameTexture` returns `null`; the service returns
  `null` and the existing per-tribe texture path renders instead (no blank villages).
- Missing/partial `settlement.build` (old saves, direct construction) → `'m1'` fallback for
  every missing middle block; the composite still renders with correct block counts.
- Level-1 village → no middle blocks; composite is just the seven top blocks.

## Testing

- `upgradeVillage` rolling (in `tests/village.test.ts` area): after upgrade to level N every
  column array has `N - 1` entries, each `'m1'`/`'m2'`; repeated upgrades append; a legacy
  settlement without `build` gains a full top-up; a stub `roll` makes results deterministic.
- `villageBuildFrames`: for levels 1–3 returns 7 `N` blocks in draw order with the table's
  `x`/`y`/frame identities and the expected `width`/`height`.
- Existing suites stay green: `village-texture`, `village-anchor-lifecycle`, `map-renderer`,
  `tile-signature`.
- Run `npm test` and `npm run typecheck`.