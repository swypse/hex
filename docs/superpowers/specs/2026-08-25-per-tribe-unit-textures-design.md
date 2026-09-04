# Per-Tribe Unit Textures Design

Date: 2026-08-25

## Problem

Unit sprites are tribe-agnostic: every tribe renders the same `warrior.png` /
`rider.png` / `archer.png` / `swordsman.png` sprites. Dedicated per-tribe sprites
exist (`cats-archer.png`, `barbarians-warrior.png`, ...) and should be used so
each tribe's units look distinct.

## Decisions

1. Change `UNIT_IMAGE_FILES` from `Record<UnitType, string>` to
   `Record<Tribe, Record<UnitType, string>>`, mapping `Tribe` (Cats, Warriors,
   Villagers, Barbarians) x `UnitType` (warrior, rider, archer, swordsman) to
   `<tribe>-<unittype>.png` files.
2. `textureFactory` builds `unitTextures[tribe.id][type]` from the per-tribe
   image; the `TextureSet.unitTextures` shape stays
   `Record<Tribe, Record<UnitType, TileTexture>>`, so `mapRenderer` /
   `gameController` call sites are unchanged.
3. The Spawn dialog shows the local player's tribe sprites (it already renders
   the player's own village).

## Section 1 — `UNIT_IMAGE_FILES` per tribe (`src/game/units.ts`)

- Import `Tribe` from `./tribes` (no circular dependency: `tribes.ts` imports
  only `../config`).
- Replace `UNIT_IMAGE_FILES: Record<UnitType, string>` with:

```ts
export const UNIT_IMAGE_FILES: Record<Tribe, Record<UnitType, string>> = {
  [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png' },
  [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png' },
  [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png' },
  [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png' },
};
```

## Section 2 — Texture loading (`src/render/textureFactory.ts`)

Replace the current type-only unit image load and the shared `unitTypeTextures`
loop. Load all 16 images and build textures per tribe:

```ts
const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
for (const tribe of TRIBES) {
  const perTribe = {} as Record<UnitType, TileTexture>;
  for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
    const img = await loadImageTexture(TEXTURE_BASE + UNIT_IMAGE_FILES[tribe.id][type]);
    const tex = makeUnitImageTexture(app, img, hexSize);
    if (tex) perTribe[type] = tex;
  }
  unitTextures[tribe.id] = perTribe;
}
```

Remove the now-unused `unitImageMap` / `unitTypeTextures` locals. Keep the
`if (tex)` guard (missing image -> type absent, same as current behavior).

## Section 3 — Spawn dialog (`src/ui/overlays/SpawnDialog.ts`)

Change the icon lookup to the local player's tribe:

```ts
const icon = makeIcon(UNIT_IMAGE_FILES[s.players[s.localPlayerIndex].tribe][type], 56);
```

`drawCard` already receives the store state as `s` (`ReturnType<typeof
useGameStore.getState>`), so `s.players[s.localPlayerIndex]` is in scope; no
other changes to the dialog.

## Section 4 — Tests (`tests/units.test.ts`)

Update the `UNIT_IMAGE_FILES` assertion to the nested per-tribe mapping.

## Files touched

- Modify: `src/game/units.ts`, `src/render/textureFactory.ts`,
  `src/ui/overlays/SpawnDialog.ts`, `tests/units.test.ts`.
- Assets: stage the texture renames (`archer.png`→`cats-archer.png`, etc.) and
  the new per-tribe PNGs under `public/textures/`.

## Testing

- `npm run typecheck` and `npm test` must pass.
- `tests/units.test.ts` asserts the full nested `UNIT_IMAGE_FILES` mapping.
- Manual (`npm run dev`): each tribe's units render with distinct sprites;
  Spawn dialog shows the local tribe's unit icons; ships/villages/buildings
  unaffected.
