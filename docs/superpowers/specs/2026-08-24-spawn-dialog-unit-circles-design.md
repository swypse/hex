# Spawn Dialog Unit Circles Design

Date: 2026-08-24

## Problem

The spawn dialog renders a vertical list of text buttons. We want a more visual
picker: unit textures shown in circles with the unit name and price below. Disabled
units (unaffordable or skill-gated) must look disabled, and clicking them should
explain why instead of doing nothing. The dialog should also close on outside click.

## Design

### Data move

Add to `src/game/units.ts` (pure data, no Pixi deps):

```ts
export const UNIT_IMAGE_FILES: Record<UnitType, string> = {
  warrior: 'warrior.png',
  archer: 'archer.png',
  swordsman: 'swordsman.png',
  rider: 'rider.png',
};
```

Update `src/render/textureFactory.ts` to import `UNIT_IMAGE_FILES` from
`../game/units` and delete its local copy. No behavior change; textures already
live in `public/textures/`. The UI builds image URLs as
`${import.meta.env.BASE_URL}textures/${UNIT_IMAGE_FILES[type]}`.

### SpawnDialog rewrite

Rewrite `src/ui/SpawnDialog.tsx` (no store changes):

- Keep the existing outer overlay (`position: absolute; inset: 0`, dimmed,
  `zIndex: 30`). Clicking the overlay closes the dialog (`setSpawnDialogOpen(false)`);
  clicks on the card stop propagation.
- Dialog card (dark `#000`, rounded, padding) with a title row: "Spawn a unit" and a
  close ✕ button, followed by a horizontal row (`display: flex; gap`) of 4 unit options.
- Each unit option is a `<button>` column:
  - A 64px `border-radius: 50%` disc holding the unit texture `<img>` with
    `object-fit: cover` and `object-position: center 70%` (the source images are tall
    254x448 portraits; the sprite sits around 70% height), plus a border for definition.
  - Below the circle: `{UNIT_TYPE_NAMES[type]}` then the price line
    (`{price}` or `{price} + {priceOre} ore`).
- Enabled unit (affordable and, for swordsman, skill unlocked): normal styling;
  click spawns via `gameController.spawnSelectedVillage(type)`, which closes the dialog.
- Disabled unit: `opacity ~0.4`, default cursor; click opens the reason modal instead.
- Village-full guard stays in `spawnUnit`; it is unreachable here because the toolbar
  hides the Spawn button when the village is full.

### Disabled reason modal

- A nested overlay rendered on top of the dialog (`position: absolute; inset: 0`,
  higher z-index, dimmed), with the unit name as the title.
- Body lists all applicable reasons, one per line:
  - Money: "Not enough money — need {price}, have {money}"
  - Ore (only when `priceOre > 0`): "Not enough ore — need {priceOre}, have {ore}"
  - Skill (swordsman without the skill): "Requires the Swordsman skill"
- Closed by an OK/✕ button or an outside click; returns to the spawn dialog.
- Implemented with local `useState<UnitType | null>` in `SpawnDialog` tracking which
  disabled circle was clicked.

## Files touched

- `src/game/units.ts` (add `UNIT_IMAGE_FILES`)
- `src/render/textureFactory.ts` (import the map, delete local copy)
- `src/ui/SpawnDialog.tsx` (rewrite)

## Testing

- Unit: add a test in `tests/units.test.ts` asserting `UNIT_IMAGE_FILES` covers every
  unit type with the expected filenames.
- `tests/gameStore.test.ts` is unaffected (`spawnDialogOpen` unchanged).
- Run `npm test` and `npm run typecheck`.
- Manual (`npm run dev`): dialog opens from the toolbar Spawn button; circles show
  textures with name + price below; a disabled swordsman (no skill / not enough
  money) opens the reason modal listing the reasons; outside click closes dialog and
  reason modal.
