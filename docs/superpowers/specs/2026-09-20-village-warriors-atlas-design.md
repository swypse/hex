# Village Warriors Composite Textures Design

## Goal

Give the Warriors tribe the same composite village build as the Villagers: a village is drawn
as ground-anchored stacked columns of blocks from a dedicated `village-warriors-atlas.png`,
with the identical geometry, per-column block counts, m1–m4 random variants recorded at
upgrade, and the upgraded `reattach`-safe baking path. Warriors join the compositing exactly
where Villagers are today; every other tribe keeps its static village sprite.

## Background / current behavior

- `tools/packVillageVillagers.mjs` packs `src/assets/village-villagers/*.png` (10 files,
  70×52) into `public/textures/village-villagers-atlas.png` and writes the manifest
  `src/game/village-villagers-atlas-data.gen.ts` (`VILLAGE_VILLAGERS_ATLAS_*`).
  `tests/pack-village-villagers.test.mjs` pins its output (frames, determinism, committed PNG
  in sync).
- `src/render/village-build-atlas.ts` loads the villagers atlas and slices frames;
  `src/render/village-build-texture.ts` exposes the pure geometry (`villageBuildFrames`,
  `villageBuildHeight`, `villageBuildSignature`, `villageBuildAnchorY`) plus the
  `VillageBuildTextureService` (bakes + caches one composite texture per look, anchored with
  its ground a fixed 56px below the hex center).
- `villageTextureFor` composites **only** when `tribe === Tribe.Villagers`; the service is
  passed as a single `TextureSet.villageBuild`.
- `upgradeVillage` already records per-column `m1..m4` variants into `Settlement.build` for
  **every** owned settlement regardless of tribe, so no state changes are needed.

## Architecture

Parameterize the two existing pieces by tribe prefix:

- **Packer:** one shared pack core (`tools/packVillageTribes.mjs`) parameterized by tribe
  slug; the existing villagers script becomes a thin wrapper and a new warriors script is
  added. Warriors assets (10 PNGs: `warriors-{l,r}-m1..m4` + `-t1`) pack to
  `village-warriors-atlas.png` + `village-warriors-atlas-data.gen.ts`.
- **Renderer:** the geometry and baking service take a frame prefix (`'villagers'` /
  `'warriors'`); the atlas loader gains warriors functions. `TextureSet` exposes one service
  per composited tribe; `villageTextureFor` picks by owner tribe.

## Changes

### 1. Packer — `tools/packVillageTribes.mjs` (new) + wrappers

- Shared core, parameterized by `tribe`:
  - `tribeSourceUrl(tribe)` → `../src/assets/village-<tribe>/`;
  - `tribeAtlasUrl(tribe)` → `../public/textures/village-<tribe>-atlas.png`;
  - `tribeManifestUrl(tribe)` → `../src/game/village-<tribe>-atlas-data.gen.ts`;
  - `generateVillageTribeAtlas(tribe, sourceDir, cols)` — the current villagers packing
    logic with the manifest constant names uppercased (`VILLAGE_<TRIBE>_ATLAS_*`) and the
    manifest `Record<string, …>` entries as today;
  - `writeVillageTribeAtlas(tribe)` — finalizes + writes PNG and manifest.
- `tools/packVillageVillagers.mjs` keeps its existing public exports
  (`generateVillageVillagersAtlas`, `VILLAGE_VILLAGERS_ORDER`, `VILLAGE_VILLAGERS_COLS`,
  `SOURCE_DIR_URL`, `ATLAS_URL`) by delegating to the shared core, so
  `tests/pack-village-villagers.test.mjs` keeps passing; `import.meta.main` still packs
  villagers.
- `tools/packVillageWarriors.mjs` — same shape for `'warriors'` (new manifest constants
  `VILLAGE_WARRIORS_ATLAS_*`).
- `package.json`: add `"pack:village-warriors": "node tools/packVillageWarriors.mjs"`.
- Run both packers; commit `public/textures/village-warriors-atlas.png` and
  `src/game/village-warriors-atlas-data.gen.ts`.

### 2. Atlas loading — `src/render/village-build-atlas.ts`

- Add `ensureVillageWarriorsAtlas(): Promise<void>` and
  `villageWarriorFrameTexture(frameKey): Texture | null`, mirroring the villagers loader
  (same single-load-promise, shared frame cache, null-on-failure). Keep the existing
  villagers exports unchanged (the villagers atlas test imports them).

### 3. Geometry & baking — `src/render/village-build-texture.ts`

- `villageBuildFrames(level, build?, prefix: string = 'villagers')`: frame keys become
  `` `${prefix}-${texSide}-${…}` `` (`warriors-l-t1`, …). Height/signature/anchor logic is
  frame-prefix independent and unchanged.
- `VillageBuildTextureService` constructor gains `prefix: string` and forwards it through
  `villageBuildFrames`; the service resolves frame textures with the matching atlas loader
  (`prefix === 'warriors' ? villageWarriorFrameTexture : villageVillagerFrameTexture`).
  `ensureLoaded` loads the matching atlas.

### 4. Texture set & resolution wiring

- `TextureSet.villageBuild` becomes
  `villageBuilds?: Partial<Record<Tribe, VillageBuildTextureService>>`.
- `createTextures` builds both services (villagers + warriors), awaits their atlases, and
  returns `villageBuilds: { [Tribe.Villagers]: …, [Tribe.Warriors]: … }`.
- `villageTextureFor(settlement, textures, tribe, villageBuilds?)`: composite when
  `villageBuilds?.[ownerTribe]` yields a texture; otherwise the existing static path.
- `map-renderer.ts` passes `this.textures.villageBuilds`.

### 5. Tests

- `tests/pack-village-warriors.test.mjs` — mirror of the villagers packer test
  (`warriors` dir, 10 files, 70×52, frames in bounds, determinism, committed PNG in sync).
- `tests/village-build-texture.test.ts` — add a case where `villageBuildFrames(2, build,
  'warriors')` yields `warriors-*` frame keys at the same coordinates as the default
  `villagers` frames.
- Existing suites stay green (`pack-village-villagers`, `village-build-texture`,
  `village-build-atlas`, `map-renderer`, `village-texture`).

## Error handling

- Missing warriors frames or a failed warriors atlas load degrade exactly like villagers: the
  composite returns `null` and the static per-tribe village texture renders instead.
- `villageBuilds` is optional, so every test/consumer constructing a `TextureSet` without it
  keeps compiling unchanged.

## Non-goals

- No changes to column geometry, counts, anchoring, the upgrade rolling, or the sparks.
- No changes for non-Villagers/non-Warriors tribes.