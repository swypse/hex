# Per-Tribe Unit Textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each tribe's units with its own sprite set (`<tribe>-<unittype>.png`) on the map and in the spawn dialog.

**Architecture:** `UNIT_IMAGE_FILES` becomes `Record<Tribe, Record<UnitType, string>>`; `textureFactory` builds `unitTextures[tribe.id][type]` from the per-tribe image. `TextureSet.unitTextures` keeps its `Record<Tribe, Record<UnitType, TileTexture>>` shape, so `mapRenderer`/`gameController` call sites are untouched. Spawn dialog indexes by the local player's tribe.

**Tech Stack:** TypeScript, PixiJS 8 (`Texture`, `Sprite`), Vitest (node env), Vite.

## Global Constraints

- No game-logic/balance changes.
- `TextureSet.unitTextures` type is unchanged — do not alter `mapRenderer.ts` or `gameController.ts`.
- The texture renames (`archer.png→cats-archer.png`, `rider.png→cats-rider.png`, `swordsman.png→warriors-swordsman.png`, `warrior.png` deleted) are already committed in `ae01a6b`.
- 12 per-tribe PNGs are untracked; stage them in Task 2.
- Do **not** stage `public/textures/capture.png` or `public/textures/upgrade.png` (user's unrelated tweaks).
- Typecheck is only fully green after Task 3; Tasks 1–2 verify with targeted test runs + `npm test`.

---
### Task 1: `UNIT_IMAGE_FILES` becomes per-tribe

**Files:**
- Modify: `src/game/units.ts:22-27` (replace the flat map; add `Tribe` import)
- Test: `tests/units.test.ts`

**Interfaces:**
- Consumes: `Tribe` enum from `src/game/tribes` (imports only `../config` — no cycle).
- Produces: `export const UNIT_IMAGE_FILES: Record<Tribe, Record<UnitType, string>>`. Tasks 2 and 3 consume this.

- [ ] **Step 1: Write the failing test**

In `tests/units.test.ts`:

1. Add `import { Tribe } from '../src/game/tribes';` at the top.
2. Replace the `UNIT_IMAGE_FILES` describe block (lines 23-32) with:

```ts
describe('UNIT_IMAGE_FILES', () => {
  it('maps every tribe and unit type to its texture file', () => {
    expect(UNIT_IMAGE_FILES).toEqual({
      [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png' },
      [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png' },
      [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png' },
      [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/units.test.ts`
Expected: FAIL — `UNIT_IMAGE_FILES` still has the old flat shape.

- [ ] **Step 3: Implement**

In `src/game/units.ts`:

1. Add the import:
   `import { Tribe } from './tribes';`
2. Replace lines 22-27:

```ts
export const UNIT_IMAGE_FILES: Record<UnitType, string> = {
  warrior: 'warrior.png',
  rider: 'rider.png',
  archer: 'archer.png',
  swordsman: 'swordsman.png',
};
```

with:

```ts
export const UNIT_IMAGE_FILES: Record<Tribe, Record<UnitType, string>> = {
  [Tribe.Cats]: { warrior: 'cats-warrior.png', rider: 'cats-rider.png', archer: 'cats-archer.png', swordsman: 'cats-swordsman.png' },
  [Tribe.Warriors]: { warrior: 'warriors-warrior.png', rider: 'warriors-rider.png', archer: 'warriors-archer.png', swordsman: 'warriors-swordsman.png' },
  [Tribe.Villagers]: { warrior: 'villagers-warrior.png', rider: 'villagers-rider.png', archer: 'villagers-archer.png', swordsman: 'villagers-swordsman.png' },
  [Tribe.Barbarians]: { warrior: 'barbarians-warrior.png', rider: 'barbarians-rider.png', archer: 'barbarians-archer.png', swordsman: 'barbarians-swordsman.png' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/units.ts tests/units.test.ts
git commit -m "feat: map unit textures per tribe"
```

---
### Task 2: Load per-tribe unit textures in `textureFactory`

**Files:**
- Modify: `src/render/textureFactory.ts:228-234` (delete the type-only image load) and `:269-278` (per-tribe texture build)
- Assets: stage the 12 untracked per-tribe PNGs

**Interfaces:**
- Consumes: `UNIT_IMAGE_FILES` (Task 1), `TRIBES`, `UNIT_TYPES`, `makeUnitImageTexture`.
- Produces: `unitTextures: Record<Tribe, Record<UnitType, TileTexture>>` — same shape as before, now with distinct per-tribe textures.

- [ ] **Step 1: Implement**

In `src/render/textureFactory.ts`:

1. Delete lines 228-234 (the `unitImages` Promise.all and `unitImageMap`):

```ts
  const unitImages = await Promise.all(
    (Object.entries(UNIT_IMAGE_FILES) as [string, string][]).map(([key, file]) =>
      loadImageTexture(TEXTURE_BASE + file).then((t) => [key, t] as const),
    ),
  );
  const unitImageMap = new Map<string, Texture | null>(unitImages);
```

2. Replace lines 269-278:

```ts
  const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
  const unitTypeTextures = {} as Record<UnitType, TileTexture>;
  for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
    const img = unitImageMap.get(type) ?? null;
    const tex = makeUnitImageTexture(app, img, hexSize);
    if (tex) unitTypeTextures[type] = tex;
  }
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = unitTypeTextures;
  }
```

with:

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

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass (textureFactory is not unit-tested; `tests/textureFactory.test.ts` only covers `tileElevation`).

- [ ] **Step 3: Stage textures and commit**

```bash
git add src/render/textureFactory.ts \
  public/textures/barbarians-archer.png public/textures/barbarians-rider.png \
  public/textures/barbarians-swordsman.png public/textures/barbarians-warrior.png \
  public/textures/cats-swordsman.png public/textures/cats-warrior.png \
  public/textures/villagers-archer.png public/textures/villagers-rider.png \
  public/textures/villagers-swordsman.png public/textures/villagers-warrior.png \
  public/textures/warriors-archer.png public/textures/warriors-rider.png \
  public/textures/warriors-warrior.png
git commit -m "feat: load per-tribe unit sprites"
```

---
### Task 3: Spawn dialog uses the local player's tribe sprites

**Files:**
- Modify: `src/ui/overlays/SpawnDialog.ts:92`

**Interfaces:**
- Consumes: `UNIT_IMAGE_FILES` (Task 1), `useGameStore` state `s` in `drawCard`.

- [ ] **Step 1: Implement**

In `src/ui/overlays/SpawnDialog.ts`, `drawCard`, change line 92:

```ts
      const icon = makeIcon(UNIT_IMAGE_FILES[type], 56);
```

to:

```ts
      const icon = makeIcon(UNIT_IMAGE_FILES[s.players[s.localPlayerIndex].tribe][type], 56);
```

(`s` is the `drawCard` parameter of type `ReturnType<typeof useGameStore.getState>`; no other changes.)

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/overlays/SpawnDialog.ts
git commit -m "feat: show local tribe sprites in spawn dialog"
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`
1. Each tribe's units render with its own sprites on the map.
2. The spawn dialog shows the local player's tribe unit icons.
3. Ships, villages, and buildings are unaffected.
