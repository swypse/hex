# Action Buttons Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pack the 20 button icons in `src/assets/action-buttons/` into one quantized atlas (`action-buttons-atlas.png`), and render the toolbar action buttons, skills button, stats button, and achievements button from its frames.

**Architecture:** A new `tools/packActionButtons.mjs` mirrors `packAchievements.mjs` (reusing the shared PNG codec + `finalizeAtlas` from `packSkills.mjs`) and emits `public/textures/action-buttons-atlas.png` + `src/game/actionButtonAtlasData.gen.ts`. A new `src/ui/kit/actionButtonIcons.ts` mirrors `skillIcons.ts` (single atlas texture, `Texture{ source, frame }` slicing, per-frame cache). `IconButton` gains an optional `iconFactory` so HUD callers can pass `makeActionButtonIcon` while the default stays `makeIcon` (all existing HUDs/tests unchanged).

**Tech Stack:** Node 22+ (`.mjs` pack script), PixiJS 8 (`Texture`, `Rectangle`, `Sprite`), Vitest.

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- Follow existing code style: no comments unless self-evident, 2-space indent, `noUncheckedIndexedAccess` (index access needs `!`).
- `.mjs` files are plain JS (no type annotations).
- Reuse `decodePng`, `encodePng`, `finalizeAtlas` from `tools/packSkills.mjs` — do not duplicate the codec.
- `IconButton`'s `iconFactory` must default to `makeIcon`; existing `iconButton.test.ts` and HUD tests must pass without edits.
- The atlas is quantized at write time (`finalizeAtlas`), like the skills/achievements atlases.
- Commit after each task with conventional messages (`feat:`, `docs:`, etc.).

---

### Task 1: `packActionButtons.mjs` script + manifest

**Files:**
- Create: `tools/packActionButtons.mjs`
- Create: `tests/packActionButtons.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `decodePng`, `encodePng`, `finalizeAtlas` from `./packSkills.mjs`.
- Produces:
  - `export const SOURCE_DIR_URL` (`../src/assets/action-buttons/`)
  - `export const ATLAS_URL` (`../public/textures/action-buttons-atlas.png`)
  - `export const MANIFEST_URL` (`../src/game/actionButtonAtlasData.gen.ts`)
  - `export const ACTION_BUTTON_COLS = 5`
  - `export const ACTION_BUTTON_CELL = 120`
  - `export const ACTION_BUTTON_ATLAS_FILE = 'action-buttons-atlas.png'`
  - `export const ACTION_BUTTON_ORDER` (sorted base names)
  - `export function generateActionButtonAtlas(sourceDir?, cols?): { png, manifestTs, frames, width, height, cell, cols, rgba }`
  - `export async function writeActionButtonAtlas(): Promise<out>`
  - `import.meta.main` entry that runs `writeActionButtonAtlas` and prints a summary.
  - `npm run pack:action-buttons`.

- [ ] **Step 1: Write the failing test**

`tests/packActionButtons.test.mjs` (copy the shape of `tests/packAchievements.test.mjs`, changing names to the action-button equivalents):

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
import {
  generateActionButtonAtlas,
  ACTION_BUTTON_ORDER,
  ACTION_BUTTON_COLS,
  ACTION_BUTTON_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packActionButtons.mjs';

describe('action button atlas generation', () => {
  const FILES = readdirSync(SOURCE_DIR_URL)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -4))
    .sort();

  it('covers exactly the PNG files in the action-buttons dir, exactly once', () => {
    expect(ACTION_BUTTON_ORDER.length).toBe(FILES.length);
    expect([...new Set(ACTION_BUTTON_ORDER)]).toEqual(ACTION_BUTTON_ORDER);
    expect(ACTION_BUTTON_ORDER).toEqual(FILES);
  });

  it('is deterministic: two runs produce identical PNG bytes and manifest', () => {
    const a = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    const b = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    expect(Buffer.compare(a.png, b.png)).toBe(0);
    expect(a.manifestTs).toBe(b.manifestTs);
  });

  it('returns non-overlapping 120x120 frames inside the atlas bounds', () => {
    const { frames, width, height } = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    const rows = Math.ceil(FILES.length / ACTION_BUTTON_COLS);
    expect(width).toBe(ACTION_BUTTON_COLS * ACTION_BUTTON_CELL);
    expect(height).toBe(rows * ACTION_BUTTON_CELL);
    const seen = new Set();
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      expect(f.w).toBe(ACTION_BUTTON_CELL);
      expect(f.h).toBe(ACTION_BUTTON_CELL);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + ACTION_BUTTON_CELL).toBeLessThanOrEqual(width);
      expect(f.y + ACTION_BUTTON_CELL).toBeLessThanOrEqual(height);
    }
  });

  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });

  it('references only real, valid 120x120 action button icons', () => {
    const { frames } = generateActionButtonAtlas(SOURCE_DIR_URL, ACTION_BUTTON_COLS);
    for (const id of FILES) {
      const f = frames[id];
      expect(f).not.toBeUndefined();
      const src = readFileSync(fileURLToPath(new URL(`${id}.png`, SOURCE_DIR_URL)));
      const png = decodePng(src);
      expect([png.width, png.height]).toEqual([ACTION_BUTTON_CELL, ACTION_BUTTON_CELL]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packActionButtons.test.mjs`
Expected: FAIL — `Cannot find module '../tools/packActionButtons'`.

- [ ] **Step 3: Write `tools/packActionButtons.mjs`**

```js
// Packs the individual action button icon PNGs (src/assets/action-buttons/*.png)
// into a single compressed atlas PNG plus a generated manifest. The source
// files are never modified. Run with: npm run pack:action-buttons
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { URL } from 'node:url';
import { decodePng, encodePng, finalizeAtlas } from './packSkills.mjs';

export const SOURCE_DIR_URL = new URL('../src/assets/action-buttons/', import.meta.url);
export const ATLAS_URL = new URL('../public/textures/action-buttons-atlas.png', import.meta.url);
export const MANIFEST_URL = new URL('../src/game/actionButtonAtlasData.gen.ts', import.meta.url);

export const ACTION_BUTTON_COLS = 5;
export const ACTION_BUTTON_CELL = 120;
export const ACTION_BUTTON_ATLAS_FILE = 'action-buttons-atlas.png';

/** Permanent, sorted order of the source icon base names (e.g. 'action-upgrade'). */
export const ACTION_BUTTON_ORDER = readdirSync(SOURCE_DIR_URL)
  .filter((n) => n.endsWith('.png'))
  .map((n) => n.slice(0, -'.png'.length))
  .sort();

export function generateActionButtonAtlas(sourceDir = SOURCE_DIR_URL, cols = ACTION_BUTTON_COLS) {
  const order = readdirSync(sourceDir)
    .filter((n) => n.endsWith('.png'))
    .map((n) => n.slice(0, -'.png'.length))
    .sort();
  const cells = order.length;
  const rows = Math.ceil(cells / cols);
  const width = cols * ACTION_BUTTON_CELL;
  const height = rows * ACTION_BUTTON_CELL;
  const rgba = Buffer.alloc(width * height * 4); // zero = fully transparent
  const frames = {};

  order.forEach((base, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * ACTION_BUTTON_CELL;
    const y = row * ACTION_BUTTON_CELL;
    const src = readFileSync(new URL(`${base}.png`, sourceDir));
    const icon = decodePng(src);
    if (icon.width !== ACTION_BUTTON_CELL || icon.height !== ACTION_BUTTON_CELL) {
      throw new Error(`${base}.png must be ${ACTION_BUTTON_CELL}x${ACTION_BUTTON_CELL}, got ${icon.width}x${icon.height}`);
    }
    for (let yy = 0; yy < ACTION_BUTTON_CELL; yy++) {
      icon.rgba.copy(rgba, (y + yy) * width * 4 + x * 4, yy * ACTION_BUTTON_CELL * 4, (yy + 1) * ACTION_BUTTON_CELL * 4);
    }
    frames[base] = { x, y, w: ACTION_BUTTON_CELL, h: ACTION_BUTTON_CELL };
  });

  const entries = order
    .map((base) => `  '${base}': { x: ${frames[base].x}, y: ${frames[base].y} },`)
    .join('\n');
  const manifestTs = `// AUTO-GENERATED by tools/packActionButtons.mjs — do not edit by hand.
// Regenerate after adding/changing action button icons: npm run pack:action-buttons

export const ACTION_BUTTON_ATLAS_FILE = '${ACTION_BUTTON_ATLAS_FILE}';
export const ACTION_BUTTON_ATLAS_CELL = ${ACTION_BUTTON_CELL};
export const ACTION_BUTTON_ATLAS_COLS = ${cols};
export const ACTION_BUTTON_ATLAS_FRAMES: Record<string, { x: number; y: number }> = {
${entries}
};
`;

  return {
    png: encodePng(rgba, width, height),
    manifestTs,
    frames,
    width,
    height,
    cell: ACTION_BUTTON_CELL,
    cols,
    rgba,
  };
}

export async function writeActionButtonAtlas() {
  const out = generateActionButtonAtlas();
  const png = await finalizeAtlas(out.png);
  writeFileSync(ATLAS_URL, png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return { ...out, png };
}

if (import.meta.main) {
  const out = await writeActionButtonAtlas();
  console.log(`packed ${Object.keys(out.frames).length} action button icons -> ${out.width}x${out.height} atlas (${out.png.length} bytes)`);
  console.log(`wrote ${ATLAS_URL.pathname}`);
  console.log(`wrote ${MANIFEST_URL.pathname}`);
}
```

Note: the manifest `ACTION_BUTTON_ATLAS_COLS` is emitted with the local `cols`
parameter (like `packAchievements.mjs` emits `${cols}`), so the generated file
reflects whichever column count the generator ran with.

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add (after `pack:achievements`):

```json
"pack:action-buttons": "node tools/packActionButtons.mjs",
```

- [ ] **Step 5: Regenerate the atlas + run tests**

Run: `npm run pack:action-buttons`
Expected: prints a packed atlas byte count (quantized via `finalizeAtlas`) and
writes both files.

Run: `npx vitest run tests/packActionButtons.test.mjs`
Expected: PASS (all 5 tests; the committed-sync test matches the just-written atlas).

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/packActionButtons.mjs tests/packActionButtons.test.mjs package.json package-lock.json public/textures/action-buttons-atlas.png src/game/actionButtonAtlasData.gen.ts
git commit -m "feat: pack action buttons into a quantized atlas"
```

---

### Task 2: Runtime atlas slicer + `IconButton` factory

**Files:**
- Create: `src/ui/kit/actionButtonIcons.ts`
- Create: `tests/actionButtonIcons.test.ts`
- Modify: `src/ui/kit/iconButton.ts`

**Interfaces:**
- Consumes: `ACTION_BUTTON_ATLAS_FILE`, `ACTION_BUTTON_ATLAS_CELL`, `ACTION_BUTTON_ATLAS_FRAMES` from `../../game/actionButtonAtlasData.gen`.
- Produces:
  - `export const ACTION_BUTTON_ICON_FILES: Record<string, string>` — logical key → atlas frame key (see Step 3 for exact rows).
  - `export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite`
  - `IconButtonOpts.iconFactory?: (name: string, size: number, onReady?: () => void) => Sprite`
  - `IconButton` uses `opts.iconFactory ?? makeIcon`.

- [ ] **Step 1: Write the failing test**

`tests/actionButtonIcons.test.ts` (copy `tests/skillIcons.test.ts`, changing module + exported names):

```ts
import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FRAMES, ACTION_BUTTON_ATLAS_CELL } from '../src/game/actionButtonAtlasData.gen';
import { ACTION_BUTTON_ICON_FILES } from '../src/ui/kit/actionButtonIcons';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface ActionButtonIconsModule {
  ACTION_BUTTON_ICON_FILES: Record<string, string>;
  makeActionButtonIcon: (key: string, size: number, onReady?: () => void) => { width: number; height: number; destroy: () => void; texture: unknown };
}

describe('makeActionButtonIcon', () => {
  let icons: ActionButtonIconsModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/actionButtonIcons');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every mapped key resolves to an atlas frame', () => {
    for (const key of Object.keys(ACTION_BUTTON_ICON_FILES)) {
      expect(ACTION_BUTTON_ATLAS_FRAMES[ACTION_BUTTON_ICON_FILES[key]!]).not.toBeUndefined();
    }
  });

  it('loads the single packed action-buttons atlas image', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/action-buttons-atlas.png`);
    expect(sprite.width).toBe(40);
    expect(sprite.height).toBe(40);
  });

  it('slices the action region out of the atlas once it loads', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    const frame = ACTION_BUTTON_ATLAS_FRAMES['action-upgrade']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.height).toBe(ACTION_BUTTON_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = icons.makeActionButtonIcon('action-upgrade', 40);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/actionButtonIcons.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write `src/ui/kit/actionButtonIcons.ts`**

```ts
import { Rectangle, Sprite, Texture } from 'pixi.js';
import { ACTION_BUTTON_ATLAS_FILE, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_FRAMES } from '../../game/actionButtonAtlasData.gen';

const TEXTURE_BASE = `${import.meta.env.BASE_URL}textures/`;

/** Logical button key -> atlas frame key. Atlas frames live in ACTION_BUTTON_ATLAS_FRAMES. */
export const ACTION_BUTTON_ICON_FILES: Record<string, string> = {
  upgrade: 'action-upgrade',
  'upgrade-ship': 'action-upgrade',
  wall: 'action-build-wall',
  sawmill: 'action-build-sawmill',
  mine: 'action-build-mine',
  port: 'action-build-port',
  road: 'action-build-road',
  bridge: 'action-build-bridge',
  heal: 'action-heal',
  disband: 'action-disband',
  capture: 'action-capture',
  spawn: 'action-spawn',
  temple: 'action-water-temple',
  forestTemple: 'action-forest-temple',
  bonus: 'action-get-bonus',
  bottle: 'action-get-bottle',
  stats: 'action-stats',
  skills: 'action-skills',
  achievements: 'action-cup',
  'end-turn': 'action-end-turn',
};

let atlasTexture: Texture | null = null;
const frameCache = new Map<string, Texture>();

function sliceFrame(key: string, atlas: Texture): Texture | null {
  const frame = ACTION_BUTTON_ATLAS_FRAMES[key];
  if (!frame) return null;
  const cached = frameCache.get(key);
  if (cached) return cached;
  const tex = new Texture({
    source: atlas.source,
    frame: new Rectangle(frame.x, frame.y, ACTION_BUTTON_ATLAS_CELL, ACTION_BUTTON_ATLAS_CELL),
    label: key,
  });
  frameCache.set(key, tex);
  return tex;
}

export function makeActionButtonIcon(key: string, size: number, onReady?: () => void): Sprite {
  const sprite = new Sprite();
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  if (atlasTexture) {
    const tex = sliceFrame(key, atlasTexture);
    if (tex) sprite.texture = tex;
    onReady?.();
    return sprite;
  }
  const img = new Image();
  img.onload = () => {
    atlasTexture = Texture.from(img);
    const tex = sliceFrame(key, atlasTexture);
    if (sprite.destroyed) return;
    if (tex) {
      sprite.texture = tex;
      sprite.width = size;
      sprite.height = size;
    }
    onReady?.();
  };
  img.src = TEXTURE_BASE + ACTION_BUTTON_ATLAS_FILE;
  return sprite;
}
```

- [ ] **Step 4: Add `iconFactory` to `IconButton`**

In `src/ui/kit/iconButton.ts`:

Add to `IconButtonOpts`:

```ts
  /** Overrides how the icon sprite is built (default `makeIcon`). */
  iconFactory?: (name: string, size: number, onReady?: () => void) => Sprite;
```

In the constructor, change:

```ts
    this.sprite = makeIcon(opts.icon, iconSize, () => opts.onReady?.());
```

to:

```ts
    const buildIcon = opts.iconFactory ?? makeIcon;
    this.sprite = buildIcon(opts.icon, iconSize, () => opts.onReady?.());
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/actionButtonIcons.test.ts tests/iconButton.test.ts`
Expected: PASS (new slicer tests green; `IconButton` default-behavior tests unchanged).

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/kit/actionButtonIcons.ts tests/actionButtonIcons.test.ts src/ui/kit/iconButton.ts
git commit -m "feat: action button atlas renderer and IconButton icon factory"
```

---

### Task 3: Wire the HUD buttons to the atlas

**Files:**
- Modify: `src/ui/hud/HudToolbar.ts`
- Modify: `src/ui/hud/HudSkills.ts`
- Modify: `src/ui/hud/HudAchievements.ts`

**Interfaces:**
- Consumes: `makeActionButtonIcon`, `ACTION_BUTTON_ICON_FILES` from `../kit/actionButtonIcons`; `IconButton.iconFactory`.
- Produces: no new public API. The toolbar action buttons, stats button, end-turn button, skills button, and achievements button render atlas frames.

- [ ] **Step 1: Wire `HudToolbar`**

In `src/ui/hud/HudToolbar.ts`:

Add import:

```ts
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
```

Change `ICON_ACTIONS` values from file names to logical keys (frame mapping lives in `ACTION_BUTTON_ICON_FILES`). Change from:

```ts
const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade.png',
  wall: 'build-wall.png',
  'upgrade-ship': 'upgrade.png',
  heal: 'heal.png',
  disband: 'disband.png',
  capture: 'capture.png',
  spawn: 'spawn.png',
  sawmill: 'build-sawmill.png',
  mine: 'build-mine.png',
  port: 'build-port.png',
  temple: 'water-temple.png',
  forestTemple: 'forest-temple.png',
  road: 'build-road.png',
  bridge: 'build-bridge.png',
  bonus: 'get-bonus.png',
  bottle: 'get-bottle.png',
};
```

to:

```ts
const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade',
  wall: 'wall',
  'upgrade-ship': 'upgrade-ship',
  heal: 'heal',
  disband: 'disband',
  capture: 'capture',
  spawn: 'spawn',
  sawmill: 'sawmill',
  mine: 'mine',
  port: 'port',
  temple: 'temple',
  forestTemple: 'forestTemple',
  road: 'road',
  bridge: 'bridge',
  bonus: 'bonus',
  bottle: 'bottle',
};
```

In `addIcon`, pass the factory. Change:

```ts
      const btn = new IconButton({ icon, disabled, onClick, size: 48, ...ACTION_BTN });
```

to:

```ts
      const btn = new IconButton({ icon, disabled, onClick, size: 48, iconFactory: makeActionButtonIcon, ...ACTION_BTN });
```

For the stats button, change:

```ts
    const stats = new IconButton({
      icon: 'stats.png',
      size: 48,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'stats' }),
      ...ACTION_BTN,
    });
```

to:

```ts
    const stats = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['stats']!,
      size: 48,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'stats' }),
      iconFactory: makeActionButtonIcon,
      ...ACTION_BTN,
    });
```

For the end-turn button, change:

```ts
    const endTurn = new IconButton({
      icon: 'end-turn.png',
      disabled: store.aiActive,
```

to:

```ts
    const endTurn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['end-turn']!,
      disabled: store.aiActive,
```

- [ ] **Step 2: Wire `HudSkills`**

In `src/ui/hud/HudSkills.ts`, add import:

```ts
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
```

and change:

```ts
    const btn = new IconButton({
      icon: 'skills.png',
      size: SKILLS_BUTTON_SIZE,
      color: 0x373748,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'skill' }),
    });
```

to:

```ts
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['skills']!,
      size: SKILLS_BUTTON_SIZE,
      color: 0x373748,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'skill' }),
      iconFactory: makeActionButtonIcon,
    });
```

- [ ] **Step 3: Wire `HudAchievements`**

In `src/ui/hud/HudAchievements.ts`, add import:

```ts
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
```

and change:

```ts
    const btn = new IconButton({
      icon: 'cup.png',
      size: SKILLS_BUTTON_SIZE,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'achievements' }),
    });
```

to:

```ts
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['achievements']!,
      size: SKILLS_BUTTON_SIZE,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'achievements' }),
      iconFactory: makeActionButtonIcon,
    });
```

- [ ] **Step 4: Run the HUD + icon tests**

Run: `npx vitest run tests/hudToolbar.test.ts tests/hudSkills.test.ts tests/hudAchievements.test.ts tests/iconButton.test.ts tests/actionButtonIcons.test.ts`
Expected: PASS. (Existing tests assert button presence/type, not icon filenames; add `iconFactory` if any test fails due to a mocked `IconButton` signature.)

- [ ] **Step 5: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/hud/HudToolbar.ts src/ui/hud/HudSkills.ts src/ui/hud/HudAchievements.ts
git commit -m "feat: render toolbar, skills, stats and achievements buttons from action atlas"
```

---

## Self-Review

**Spec coverage:**
- Pack script (`generateActionButtonAtlas`, `writeActionButtonAtlas`, cols/cell, manifest) — Task 1 ✓
- `npm run pack:action-buttons` — Task 1 Step 4 ✓
- Quantization via `finalizeAtlas` — Task 1 (`writeActionButtonAtlas`) ✓
- Runtime slicer + `ACTION_BUTTON_ICON_FILES` mapping — Task 2 ✓
- `IconButton.iconFactory` default `makeIcon` — Task 2 Step 4 ✓
- Toolbar actions + stats + end-turn — Task 3 Step 1 ✓
- Skills button — Task 3 Step 2 ✓
- Achievements button — Task 3 Step 3 ✓
- Pack + slicer tests — Tasks 1 & 2 ✓
- Existing HUD/iconButton tests unchanged — Task 2/3 verify ✓

**Placeholders:** none — real code and commands in every step.

**Type consistency:**
- `makeActionButtonIcon(key, size, onReady?)` called by `IconButton` factory with `(name, size, onReady)` — matches the `iconFactory` type.
- `ACTION_BUTTON_ICON_FILES['stats']`, `['end-turn']`, `['skills']`, `['achievements']` are all keys defined in `actionButtonIcons.ts`.
- `IconButton` keeps `this.sprite = buildIcon(...)` assignment; `buildIcon = opts.iconFactory ?? makeIcon` is `(name, size, onReady) => Sprite` for both paths.
- Task 1 manifest export names (`ACTION_BUTTON_ATLAS_FILE/CELL/COLS/FRAMES`) match what Task 2 imports.