# Unit Feedback, HUD Cleanup, and Capture Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center unit HP bars on the unit texture, remove the top-left players list, add a bounce animation for your selected unit and a lunge animation on attacks, and replace the red-triangle capture marker with `capture.png`.

**Architecture:** All five changes live in the render/controller layer. HP-bar anchoring and the two animations are implemented in `MapView` (`mapRenderer.ts`) using world-space positions and the Pixi ticker. The attack lunge is triggered from `gameController.presentAttack` via a new `MapView.lungeUnit` method. The capture marker loads `capture.png` through the existing `TextureSet` and renders it as a bobbing sprite.

**Tech Stack:** TypeScript, PixiJS 8, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`, `src/ui/kit/**`.
- Keep `public/textures/capture.png` untouched (already present in the repo).
- The bounce animation applies ONLY to units owned by the local player; enemy selections must not bounce.
- No new `.tsx` files; no React imports.

---

### Task 1: Center the HP bar on the unit's texture

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: private helper `unitSpriteCenter(unit: Unit, players: Player[]): number` returning the world-space Y offset of the sprite image center from the tile anchor; `addHpBar` content re-anchored so the bar is centered on the given point. `HP_BAR_GAP` is removed.

- [ ] **Step 1: Replace `unitSpriteTop` with `unitSpriteCenter`**

Edit `src/render/mapRenderer.ts` — replace the `unitSpriteTop` method:

```ts
  private unitSpriteCenter(unit: Unit, players: Player[]): number {
    const tribe = players[unit.owner].tribe;
    if (unit.shipLevel !== undefined) {
      const tex = this.textures.shipTextures[tribe][unit.shipLevel === 3 ? 'level3' : 'base'];
      return (0.5 - 0.5) * tex.height * this.spriteScale;
    }
    const t = this.textures.unitTextures[tribe][unit.type];
    return (0.5 - t.anchorY) * t.texture.height * this.spriteScale;
  }
```

- [ ] **Step 2: Remove the `HP_BAR_GAP` constant**

Edit `src/render/mapRenderer.ts` — delete the line:

```ts
const HP_BAR_GAP = 10;
```

- [ ] **Step 3: Position the HP bar at the unit's center**

Edit `src/render/mapRenderer.ts` — in `update()`, replace the hp-bar push block:

```ts
        const top = this.unitSpriteTop(unit, players);
        hpBars.push({
          unit,
          position: { x: p.x, y: y - top - HP_BAR_GAP },
          canAct: unitCanAct(map, tile, unit, players[unit.owner]),
          color: tribe.color,
        });
```

with:

```ts
        const center = this.unitSpriteCenter(unit, players);
        hpBars.push({
          unit,
          position: { x: p.x, y: y + center },
          canAct: unitCanAct(map, tile, unit, players[unit.owner]),
          color: tribe.color,
        });
```

- [ ] **Step 4: Re-anchor the HP bar content on its center**

Edit `src/render/mapRenderer.ts` — replace the body of `addHpBar` (from the `barHeight` line through the end of the method) so the bar is centered on the origin:

```ts
    const barHeight = 5;
    const maxHp = UNIT_TYPES[unit.type].maxHp;

    const background = this.takeGraphics();
    background.rect(-barWidth / 2, -barHeight / 2, barWidth, barHeight).fill(0xff0000);
    el.addChild(background);

    const ratio = Math.max(0, Math.min(1, unit.hp / maxHp));
    if (ratio > 0) {
      const fill = this.takeGraphics();
      fill.rect(-barWidth / 2, -barHeight / 2, barWidth * ratio, barHeight).fill(0x00ff00);
      el.addChild(fill);
    }

    const label = this.takeText(`${unit.hp}/${maxHp}`, { fontSize: 13, fill: 0xffffff });
    label.anchor.set(0.5, 1);
    label.position.set(0, -barHeight / 2 - 2);

    const labelBg = this.takeGraphics();
    labelBg
      .rect(label.x - label.width / 2 - 2, label.y - label.height, label.width + 4, label.height)
      .fill({ color: tribeColor, alpha: 0.85 });
    el.addChild(labelBg);
    el.addChild(label);

    if (canAct && unit.owner === localPlayerIndex) {
      const dot = this.takeGraphics();
      dot.circle(barWidth / 2 + 9, -4, 4).fill(0xff0000);
      el.addChild(dot);
    }

    this.overlay.addChild(el);
    this.overlayItems.push({ el, world: position });
```

- [ ] **Step 5: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: center unit HP bar on the unit texture"
```

---

### Task 2: Remove the top-left players list

**Files:**
- Delete: `src/ui/hud/HudPlayers.ts`
- Modify: `src/ui/screens/GameScreen.ts`

**Interfaces:**
- Produces: `HudPlayers` no longer exists; `GameScreen` mounts one fewer widget.

- [ ] **Step 1: Delete the widget and unwire it**

```bash
rm src/ui/hud/HudPlayers.ts
```

Edit `src/ui/screens/GameScreen.ts` — remove the import line:

```ts
import { HudPlayers } from '../hud/HudPlayers';
```

and remove `new HudPlayers(),` from the `widgets` array.

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add -u
git commit -m "feat: remove top-left players list (standings live on Stats screen)"
```

---

### Task 3: Bounce your selected unit

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `MapView` fields `bounceRemove`, `bounceSprite`, `bounceBaseY`; private `updateSelectedBounce(selection, localPlayerIndex, players)` called from `update()`; bounce stops in `destroy()`.

- [ ] **Step 1: Add bounce state fields**

Edit `src/render/mapRenderer.ts` — add after `private stopSelectedBorder`:

```ts
  private bounceRemove: (() => void) | null = null;
  private bounceSprite: Sprite | null = null;
  private bounceBaseY = 0;
```

- [ ] **Step 2: Stop the bounce on destroy**

Edit `src/render/mapRenderer.ts` — in `destroy()`, after the `stopSelectedBorder` block:

```ts
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
```

- [ ] **Step 3: Drive the bounce from `update()`**

Edit `src/render/mapRenderer.ts` — in `update()`, after `this.startExclamationAnimation();` add:

```ts
    this.updateSelectedBounce(selection, localPlayerIndex, players);
```

- [ ] **Step 4: Implement `updateSelectedBounce`**

Edit `src/render/mapRenderer.ts` — add this method (place it near `animateSelectedBorder`):

```ts
  private updateSelectedBounce(selection: Selection | null, localPlayerIndex: number, players: Player[]): void {
    if (!this.map) return;
    let target: Sprite | null = null;
    let baseY = 0;
    if (selection && selection.kind === 'unit') {
      const tile = this.map.tiles.find((t) => t.q === selection.q && t.r === selection.r);
      if (tile && tile.unit && tile.unit.owner === localPlayerIndex && isExploredFor(tile, localPlayerIndex)) {
        const sprite = this.tileViews.get(axialKey(tile))?.unitSprite ?? null;
        if (sprite && !sprite.destroyed) {
          target = sprite;
          baseY = sprite.position.y;
        }
      }
    }
    if (this.bounceSprite === target) {
      if (target && this.bounceBaseY !== baseY) this.bounceBaseY = baseY;
      return;
    }
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
    if (!target) return;
    this.bounceSprite = target;
    this.bounceBaseY = baseY;
    const amp = this.hexSize * 0.15;
    const start = performance.now();
    const fn = (): void => {
      if (!this.bounceSprite || this.bounceSprite.destroyed) {
        if (this.bounceRemove) {
          this.bounceRemove();
          this.bounceRemove = null;
        }
        this.bounceSprite = null;
        return;
      }
      const t = ((performance.now() - start) % 700) / 700;
      this.bounceSprite.position.y = this.bounceBaseY + Math.sin(t * Math.PI * 2) * amp;
    };
    this.app.ticker.add(fn);
    this.bounceRemove = () => this.app.ticker.remove(fn);
  }
```

- [ ] **Step 5: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: bounce the local player's selected unit"
```

---

### Task 4: Attack lunge animation

**Files:**
- Modify: `src/render/mapRenderer.ts`
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Produces: `MapView.lungeUnit(fromKey: string, toKey: string, worldOffset: number): void`; `gameController.presentAttack` calls it with `worldOffset = 10 / (baseScale * zoom)` when the attacker is visible.

- [ ] **Step 1: Add `lungeUnit` to MapView**

Edit `src/render/mapRenderer.ts` — add this method (place it near `updateSelectedBounce`):

```ts
  lungeUnit(fromKey: string, toKey: string, worldOffset: number): void {
    if (!this.map) return;
    const sprite = this.tileViews.get(fromKey)?.unitSprite ?? null;
    if (!sprite || sprite.destroyed) return;
    const fromTile = this.map.tiles.find((t) => axialKey(t) === fromKey);
    const toTile = this.map.tiles.find((t) => axialKey(t) === toKey);
    if (!fromTile || !toTile) return;
    const a = hexToPixel(fromTile, this.hexSize);
    const b = hexToPixel(toTile, this.hexSize);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (dx / len) * worldOffset;
    const oy = (dy / len) * worldOffset;
    const baseX = sprite.position.x;
    const baseY = sprite.position.y;
    const start = performance.now();
    const fn = (): void => {
      if (sprite.destroyed) {
        this.app.ticker.remove(fn);
        return;
      }
      const t = Math.min(1, (performance.now() - start) / 160);
      const k = Math.sin(t * Math.PI);
      sprite.position.set(baseX + ox * k, baseY + oy * k);
      if (t >= 1) this.app.ticker.remove(fn);
    };
    this.app.ticker.add(fn);
  }
```

- [ ] **Step 2: Trigger the lunge from `presentAttack`**

Edit `src/controller/gameController.ts` — in `presentAttack`, right after the `targetVisible` line, add:

```ts
    if (attackerTile && targetTile && attackerVisible) {
      const scale = this.baseScale * this.zoom;
      this.mapView?.lungeUnit(axialKey(attackerTile), axialKey(targetTile), 10 / scale);
    }
```

(`axialKey` is already imported in this file.)

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/render/mapRenderer.ts src/controller/gameController.ts
git commit -m "feat: lunge attacker sprite toward the target on attack"
```

---

### Task 5: Capture mark uses `capture.png`

**Files:**
- Modify: `src/render/textureFactory.ts`
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `TextureSet.captureTexture: Texture | null`; the capture-marker block in `mapRenderer.update()` renders it as a bobbing sprite instead of the red triangle.

- [ ] **Step 1: Load the texture in textureFactory**

Edit `src/render/textureFactory.ts`:

- Add to the image-file constants (near `MINE_IMAGE_FILE`):

```ts
const CAPTURE_IMAGE_FILE = 'capture.png';
```

- Add to the `TextureSet` interface (near `villageConnectedTexture`):

```ts
  captureTexture: Texture | null;
```

- In `createTextures`, after the `villageConnectedTexture` line:

```ts
  const captureTexture = await loadImageTexture(TEXTURE_BASE + CAPTURE_IMAGE_FILE);
```

- Add to the returned object:

```ts
    captureTexture,
```

- [ ] **Step 2: Render the capture marker as a sprite**

Edit `src/render/mapRenderer.ts` — replace the capture-marker block in `update()`:

```ts
      if (tile.settlement && tile.settlement.captureReady && tile.unit && tile.unit.owner !== tile.settlement.owner && explored) {
        const el = new Container();
        const bob = new Container();
        const h = Math.sqrt(24 * 24 - 4 * 4);
        const mark = new Graphics();
        mark.poly([-4, -h / 2, 4, -h / 2, 0, h / 2]).fill(0xff0000).stroke({ width: 2, color: 0xffffff });
        bob.addChild(mark);
        el.addChild(bob);
        this.exclamationBobs.push(bob);
        exclamations.push({ el, world: { x: p.x, y: y - this.hexSize * 0.8 } });
      }
```

with:

```ts
      if (tile.settlement && tile.settlement.captureReady && tile.unit && tile.unit.owner !== tile.settlement.owner && explored) {
        const el = new Container();
        const bob = new Container();
        const tex = this.textures.captureTexture;
        if (tex) {
          const sprite = new Sprite(tex);
          const size = this.hexSize * 0.7;
          sprite.anchor.set(0.5, 0.5);
          sprite.width = size;
          sprite.height = size * (tex.height / tex.width);
          bob.addChild(sprite);
        }
        el.addChild(bob);
        this.exclamationBobs.push(bob);
        exclamations.push({ el, world: { x: p.x, y: y - this.hexSize * 0.8 } });
      }
```

- [ ] **Step 3: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/render/textureFactory.ts src/render/mapRenderer.ts
git commit -m "feat: use capture.png texture for capturable village marker"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (HP bar center) → Task 1; Section 2 (remove players list) → Task 2; Section 3 (own-unit bounce) → Task 3; Section 4 (attack lunge) → Task 4; Section 5 (capture.png) → Task 5. All five spec sections map to a task.
- **Type consistency:** `unitSpriteCenter` (Task 1) is the only consumer change to the hp-bar path. `MapView.lungeUnit(fromKey, toKey, worldOffset)` (Task 4) is defined in `mapRenderer.ts` and called from `gameController.presentAttack` via `this.mapView?.lungeUnit(...)`. `TextureSet.captureTexture` (Task 5) is declared in `textureFactory.ts` and read in `mapRenderer.ts`. `bounceSprite`/`bounceRemove`/`bounceBaseY` (Task 3) are only used inside `MapView`.
- **Manual smoke test (final, in a browser):**
  1. HP bar sits at the vertical center of each unit's texture, label above, tracks on zoom.
  2. No players list top-left; Stats screen still lists players.
  3. Selecting your own unit bounces its sprite; selecting an enemy unit does not.
  4. Attacks lunge the attacker 10px toward the target and back.
  5. Capturable villages show the `capture.png` marker (bobbing) instead of the red triangle.
