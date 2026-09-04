# Unit Polish and Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected-unit bounce a single cycle, make the skill tree update when a skill is opened, enlarge the capture marker 3×, and show a "TribeName died!" notification when a player is eliminated.

**Architecture:** Four small, independent render/controller changes. `MapView` (`mapRenderer.ts`) bounces the selected unit once via a `sin(π·t)` tween. `SkillTree` subscribes to the store so it rebuilds (node colors + resources) when `openSkill` lands asynchronously. The capture marker sprite is sized up in `mapRenderer.ts`. `gameController.presentCaptured` posts a center message when `ownerDied` is set.

**Tech Stack:** TypeScript, PixiJS 8, Zustand 5, Vite, Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass at the end of every task.
- Do NOT modify `src/game/**`, `src/net/**`, `src/store/**`, `src/ui/kit/**`.
- No new `.tsx` files; no React imports.
- The bounce applies ONLY to units owned by the local player; it must be a single up-down cycle that settles, and must not restart on unrelated re-renders.

---

### Task 1: Single bounce on selection

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: `MapView` gains a `bounceSel: Selection | null` field; `updateSelectedBounce` runs one ~600ms up-down cycle. Behavior preserved from before (own units only, clean switch/destroy).

- [ ] **Step 1: Add the selection-identity field**

Edit `src/render/mapRenderer.ts` — add after `private bounceBaseY = 0;`:

```ts
  private bounceSel: Selection | null = null;
```

- [ ] **Step 2: Rewrite `updateSelectedBounce`**

Edit `src/render/mapRenderer.ts` — replace the whole `updateSelectedBounce` method with:

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
    const selectionChanged = selection !== this.bounceSel;
    if (!selectionChanged && this.bounceSprite === target) {
      if (target && this.bounceBaseY !== baseY) this.bounceBaseY = baseY;
      return;
    }
    if (this.bounceRemove) {
      this.bounceRemove();
      this.bounceRemove = null;
    }
    this.bounceSprite = null;
    this.bounceSel = selection;
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
      const t = Math.min(1, (performance.now() - start) / 600);
      this.bounceSprite.position.y = this.bounceBaseY + Math.sin(t * Math.PI) * amp;
      if (t >= 1) {
        if (this.bounceRemove) {
          this.bounceRemove();
          this.bounceRemove = null;
        }
      }
    };
    this.app.ticker.add(fn);
    this.bounceRemove = () => this.app.ticker.remove(fn);
  }
```

> `selection !== this.bounceSel` uses object identity: the store replaces the `selection` object on every new selection, so re-selecting a unit (even the same tile) restarts the bounce, while unrelated re-renders (turn changes, etc.) reuse the same object and do not restart it.

- [ ] **Step 3: Reset the identity field on destroy**

Edit `src/render/mapRenderer.ts` — in `destroy()`, after `this.bounceSprite = null;` add:

```ts
    this.bounceSel = null;
```

- [ ] **Step 4: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "fix: selected unit bounces once instead of continuously"
```

---

### Task 2: Reactive skill tree

**Files:**
- Modify: `src/ui/overlays/SkillTree.ts`

**Interfaces:**
- Produces: `SkillTree` subscribes to the store on `mount` (via `useGameStore.subscribe(() => this.build())`) and unsubscribes in `destroy`.

- [ ] **Step 1: Add the subscription field**

Edit `src/ui/overlays/SkillTree.ts` — add after `private selected: SkillId | null = null;`:

```ts
  private unsub: (() => void) | null = null;
```

- [ ] **Step 2: Subscribe on mount**

Edit `src/ui/overlays/SkillTree.ts` — in `mount`, after `this.build();` add:

```ts
    this.unsub = useGameStore.subscribe(() => this.build());
```

- [ ] **Step 3: Unsubscribe on destroy**

Edit `src/ui/overlays/SkillTree.ts` — in `destroy()`, at the top add:

```ts
    if (this.unsub) this.unsub();
    this.unsub = null;
```

- [ ] **Step 4: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/overlays/SkillTree.ts
git commit -m "fix: skill tree refreshes nodes and resources when a skill is opened"
```

---

### Task 3: Capture marker 3× bigger

**Files:**
- Modify: `src/render/mapRenderer.ts`

**Interfaces:**
- Produces: capture marker sprite width `this.hexSize * 2.1` (height proportional via texture aspect).

- [ ] **Step 1: Enlarge the marker**

Edit `src/render/mapRenderer.ts` — in the capture-marker block, change:

```ts
          const size = this.hexSize * 0.7;
```

to:

```ts
          const size = this.hexSize * 2.1;
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/render/mapRenderer.ts
git commit -m "feat: make capture marker 3x bigger"
```

---

### Task 4: "TribeName died!" notification

**Files:**
- Modify: `src/controller/gameController.ts`

**Interfaces:**
- Consumes: `captured` events with `ownerDied: true`; `TRIBES` (already imported); `useGameStore`.
- Produces: when a player is eliminated, a center message `<TribeName> died!` is shown after the normal capture message.

- [ ] **Step 1: Post the death message in `presentCaptured`**

Edit `src/controller/gameController.ts` — replace `presentCaptured`:

```ts
  private presentCaptured(e: Extract<GameEvent, { type: 'captured' }>): void {
    if (!this.sim) return;
    const capturer = this.sim.players[e.newOwner];
    const village = tileAt(this.sim.map, e.q, e.r);
    if (e.oldOwner !== null && village) {
      this.showCaptureMessage(village, capturer);
    }
    if (e.ownerDied && e.oldOwner !== null) {
      const dead = this.sim.players[e.oldOwner];
      const tribe = TRIBES.find((t) => t.id === dead.tribe);
      if (tribe) useGameStore.getState().setCenterMessage(`${tribe.name} died!`);
    }
  }
```

- [ ] **Step 2: Typecheck and full test suite**

Run: `npm run typecheck && npm test`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add src/controller/gameController.ts
git commit -m "feat: notify when a player is eliminated"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (single bounce) → Task 1; Section 2 (reactive skill tree) → Task 2; Section 3 (capture marker 3×) → Task 3; Section 4 (death notification) → Task 4; Section 5 (ship landing) is intentionally a no-change, documented in the spec.
- **Type consistency:** `bounceSel`, `bounceSprite`, `bounceBaseY`, `bounceRemove` all live on `MapView` and are only touched inside `updateSelectedBounce` / `destroy`. `SkillTree.unsub` is set in `mount` and cleared in `destroy`. `presentCaptured` uses the existing `TRIBES` / `useGameStore` imports already present in `gameController.ts`.
- **Manual smoke test (final, in a browser):**
  1. Selecting your own unit bounces it once (up-down), then it settles; enemy selection does not bounce; re-selecting the same unit bounces once more.
  2. Open the skill tree, open a skill: the node turns orange with ✓ and the money in the header drops immediately.
  3. A capturable village shows the `capture.png` marker at 3× the previous size, still bobbing.
  4. Eliminating a player shows a centered "<TribeName> died!" message.
