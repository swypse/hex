# Unit Image Textures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedural unit shapes with the new `warrior/archer/swordsman/rider` images, tinted per tribe, anchored like tile textures.

**Architecture:** `textureFactory.ts` loads the unit images and generates per-tribe tinted `TileTexture`s; `mapRenderer.ts` and the move animation in `gameController.ts` use the new `anchorY`.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- No new dependencies.
- `unitTextures` shape changes from `Record<Tribe, Record<UnitType, Texture>>` to `Record<Tribe, Record<UnitType, TileTexture>>`.
- Existing 290 tests pass; `npm run typecheck` clean.

---

### Task 1: Load and tint unit images in the texture factory

**Files:**
- Modify: `src/render/textureFactory.ts`

**Interfaces:**
- Consumes: `UnitType` (imported), `TRIBES`/`Tribe` (imported), `loadImageTexture`, `IMAGE_HEX_CENTER_Y`, `IMAGE_H`, `IMAGE_HEX_W`.
- Produces: `TextureSet.unitTextures: Record<Tribe, Record<UnitType, TileTexture>>`; `makeUnitTexture` removed.

- [ ] **Step 1: Add the unit image file map and helper**

Add near `FOG_IMAGE_FILE` (after line 32):

```ts
const UNIT_IMAGE_FILES: Record<UnitType, string> = {
  warrior: 'warrior.png',
  archer: 'archer.png',
  swordsman: 'swordsman.png',
  rider: 'rider.png',
};
```

Add a helper after `loadTileImages` (after the function that ends around line 162):

```ts
function makeUnitImageTexture(
  app: Application,
  image: Texture | null,
  color: number,
  hexSize: number,
): TileTexture | null {
  if (!image) return null;
  const container = new Container();
  const sprite = new Sprite(image);
  sprite.tint = color;
  sprite.anchor.set(0.5, IMAGE_HEX_CENTER_Y / IMAGE_H);
  sprite.scale.set((Math.sqrt(3) * hexSize) / IMAGE_HEX_W);
  container.addChild(sprite);
  const texture = app.renderer.generateTexture({ target: container });
  container.destroy({ children: true });
  return { texture, anchorY: IMAGE_HEX_CENTER_Y / IMAGE_H };
}
```

- [ ] **Step 2: Load unit images in `createTextures`**

In `createTextures`, after the existing `const fogImage = images.get('fog') ?? null;` (line ~230), load the unit images:

```ts
  const unitImages = await Promise.all(
    (Object.entries(UNIT_IMAGE_FILES) as [string, string][]).map(([key, file]) =>
      loadImageTexture(TEXTURE_BASE + file).then((t) => [key, t] as const),
    ),
  );
  const unitImageMap = new Map<string, Texture | null>(unitImages);
```

- [ ] **Step 3: Replace the unit texture loop**

Replace the current `unitTextures` block (lines 265-271):

```ts
  const unitTextures = {} as Record<Tribe, Record<UnitType, TileTexture>>;
  for (const tribe of TRIBES) {
    unitTextures[tribe.id] = {} as Record<UnitType, TileTexture>;
    for (const type of Object.keys(UNIT_TYPES) as UnitType[]) {
      const img = unitImageMap.get(type) ?? null;
      const tex = makeUnitImageTexture(app, img, tribe.color, hexSize);
      if (tex) unitTextures[tribe.id][type] = tex;
    }
  }
```

- [ ] **Step 4: Update `TextureSet` interface and delete `makeUnitTexture`**

- Change the interface entry (line 49):

```ts
  unitTextures: Record<Tribe, Record<UnitType, TileTexture>>;
```

- Delete the `makeUnitTexture` function (lines 169-191).

- [ ] **Step 5: Typecheck (expect renderer errors, fixed in Task 2)**

Run: `npm run typecheck`
Expected: errors in `mapRenderer.ts` where `unitTextures[..][..]` is used as a `Texture`.

- [ ] **Step 6: Commit**

```bash
git add src/render/textureFactory.ts
git commit -m "feat: load and tint unit image textures"
```

> Note: this intermediate commit may leave `mapRenderer.ts`/`gameController.ts` failing typecheck until Task 2 completes them. It is acceptable as a checkpoint.

---

### Task 2: Use the new unit anchor in the renderer

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Consumes: `unitTextures[..][..]` now `TileTexture`.
- Produces: unit sprites anchor at `(0.5, tileTexture.anchorY)`.

- [ ] **Step 1: Update `syncSprite` to accept `anchorY`**

Change the signature and sprite creation (lines 239-252):

```ts
  private syncSprite(
    tv: TileView,
    kind: 'villageSprite' | 'buildingSprite' | 'unitSprite',
    texture: Texture | null,
    x: number,
    y: number,
    anchorY = 0.5,
  ): void {
    const current = tv[kind];
    if (texture && !current) {
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, anchorY);
      sprite.scale.set(this.spriteScale);
      sprite.position.set(x, y);
      tv.el.addChild(sprite);
      tv[kind] = sprite;
    } else if (texture && current) {
      if (current.texture !== texture) current.texture = texture;
      current.position.set(x, y);
    } else if (current) {
      tv.el.removeChild(current);
      current.destroy();
      tv[kind] = null;
    }
  }
```

- [ ] **Step 2: Pass `anchorY` for the unit sprite in `applyTile`**

Replace the unit texture lookup + sync call (lines 224-232):

```ts
    const unitTex = tile.unit && tile.unit.shipLevel !== undefined
      ? tile.unit.shipLevel === 3
        ? this.textures.shipTextures[players[tile.unit.owner].tribe].level3
        : this.textures.shipTextures[players[tile.unit.owner].tribe].base
      : tile.unit
        ? this.textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type].texture
        : null;
    this.syncSprite(
      tv,
      'unitSprite',
      unitTex,
      p.x,
      y,
      tile.unit
        ? this.textures.unitTextures[players[tile.unit.owner].tribe][tile.unit.type].anchorY
        : 0.5,
    );
    if (tv.unitSprite) tv.unitSprite.visible = explored;
```

Note: ships keep `anchor 0.5` (their textures are generated centered). The `unitTex` for ships is a plain `Texture`; for land units it is `tileTexture.texture`.

- [ ] **Step 3: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: anchor unit sprites like tile textures"
```

---

### Task 3: Update the move-animation sprite

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `textures.unitTextures[..][..]` now `TileTexture`.
- Produces: the temporary move sprite uses the unit `anchorY`.

- [ ] **Step 1: Update the sprite creation in `animateMoveEvent`**

Find the current line:

```ts
    const texture = this.textures.unitTextures[store.players[unit.owner].tribe][unit.type];
```

and the sprite creation below it:

```ts
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
```

Replace with:

```ts
    const unitTex = this.textures.unitTextures[store.players[unit.owner].tribe][unit.type];
    const texture = unitTex.texture;
```

and:

```ts
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, unitTex.anchorY);
```

- [ ] **Step 2: Typecheck, tests, build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: anchor move-animation unit sprite like tile textures"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`, start a game.
Check:
- Units render as the new warrior/archer/swordsman/rider art.
- Each tribe's units are tinted in its color.
- Units sit on their tiles aligned with the hex (same anchor as tile textures).
- During a move animation, the moving sprite uses the new art and stays aligned.
