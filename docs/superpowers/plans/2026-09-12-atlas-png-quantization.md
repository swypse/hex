# Atlas PNG Quantization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the generated atlas PNGs (~50%) by palette-quantizing them with `pngquant-bin` at write time, keeping the lossless original whenever quantization fails or does not shrink the file.

**Architecture:** `tools/packSkills.mjs` gains `compressPng(input)` (shells out to `pngquant-bin` via Node 22's promise-based `execFile`) and `finalizeAtlas(png)` (`min(original, quantized)` by length). `writeSkillAtlas` and `writeAchievementAtlas` become async and write `finalizeAtlas(generateX().png)`. The pure `generateX()` functions stay lossless (existing manifest/frame tests unchanged). The two "committed atlas in sync" tests must compare against `finalizeAtlas`, since the committed files become quantized.

**Tech Stack:** Node 22+ (`node:child_process` `execFile`, `node:fs` `mkdtempSync`/`rmSync`), `pngquant-bin` (dev dep), Vitest (`.mjs` tests).

## Global Constraints

- `npm run typecheck` and `npm test` must pass.
- `pngquant-bin` is a **devDependency only** (build tool); the game runtime never imports it.
- `pngquant` is lossy (palette → color type 3). `decodePng` in `tools/packSkills.mjs` only decodes RGBA (color type 6) and will NOT be able to decode quantized atlases — do not attempt to decode them.
- `compressPng` must never throw to its caller and must never return a buffer larger than the input.
- The pure `generateSkillAtlas`/`generateAchievementAtlas` must keep returning the lossless `png` (many tests depend on it).
- Commit after each task with conventional messages (`feat:` / `test:` / `chore:`).

---

### Task 1: `compressPng` + `finalizeAtlas` + wire skills write

**Files:**
- Modify: `tools/packSkills.mjs`
- Modify: `tests/packSkills.test.mjs`
- Modify: `package.json` (devDependencies)

**Interfaces:**
- Produces (all in `tools/packSkills.mjs`):
  - `export async function compressPng(input: Buffer): Promise<Buffer>` — quantizes via pngquant; returns original on any error/larger output.
  - `export async function finalizeAtlas(png: Buffer): Promise<Buffer>` — returns `quantized.length < png.length ? quantized : png`.
  - `writeSkillAtlas` becomes `async` and writes `await finalizeAtlas(out.png)`.

- [ ] **Step 1: Install the dependency**

Run: `npm install -D pngquant-bin`
Expected: `pngquant-bin` added to `devDependencies` in `package.json`, lockfile updated, package present under `node_modules/pngquant-bin`.

- [ ] **Step 2: Update the failing sync test**

In `tests/packSkills.test.mjs`, change the import line (add `finalizeAtlas`) and the sync test. Change:

```js
import {
  encodePng,
  decodePng,
  generateSkillAtlas,
  skillOrder,
  ATLAS_COLS,
  ATLAS_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packSkills.mjs';
```

to add `finalizeAtlas`:

```js
import {
  encodePng,
  decodePng,
  generateSkillAtlas,
  finalizeAtlas,
  skillOrder,
  ATLAS_COLS,
  ATLAS_CELL,
  SOURCE_DIR_URL,
  ATLAS_URL,
} from '../tools/packSkills.mjs';
```

Change the test:

```js
  it('keeps the committed atlas PNG in sync with the packer output', () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const { png } = generateSkillAtlas(SOURCE_DIR, ATLAS_COLS);
    expect(Buffer.compare(committed, png)).toBe(0);
  });
```

to:

```js
  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateSkillAtlas(SOURCE_DIR, ATLAS_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/packSkills.test.mjs`
Expected: FAIL — `finalizeAtlas` does not exist in the module yet.

- [ ] **Step 4: Implement `compressPng` and `finalizeAtlas`**

In `tools/packSkills.mjs`, add imports at the top:

```js
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import pngquant from 'pngquant-bin';
```

Add these functions before `export function generateSkillAtlas`:

```js
/** Quantizes a PNG buffer with pngquant (8-bit palette, color type 3). Falls
 *  back to the original buffer on any error (missing binary, pngquant failure,
 *  no reduction). Never throws. */
export async function compressPng(input) {
  const tmp = mkdtempSync('/tmp/hex-atlas-XXXXXX');
  const inPath = `${tmp}/in.png`;
  const outPath = `${tmp}/out.png`;
  try {
    writeFileSync(inPath, input);
    await execFile(pngquant, ['--quality=20-50', '--force', inPath, '-o', outPath]);
    return readFileSync(outPath);
  } catch {
    return input;
  } finally {
    try { rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/** Returns the smaller of a lossless PNG and its pngquant quantization. */
export async function finalizeAtlas(png) {
  const quantized = await compressPng(png);
  return quantized.length < png.length ? quantized : png;
}
```

Note: `.mjs` files are plain JS — no type annotations. Extend the existing
`node:fs` import instead of duplicating it; the final import line becomes:

```js
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
```

(`readFileSync` and `writeFileSync` are already imported — replace the current
`node:fs` import statement with the line above, adding `mkdtempSync` and
`rmSync`.) The repo is Linux-targeted, so the `/tmp` prefix is fine.

- [ ] **Step 5: Make `writeSkillAtlas` async**

Change:

```js
export function writeSkillAtlas() {
  const out = generateSkillAtlas();
  writeFileSync(ATLAS_URL, out.png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return out;
}
```

to:

```js
export async function writeSkillAtlas() {
  const out = generateSkillAtlas();
  const png = await finalizeAtlas(out.png);
  writeFileSync(ATLAS_URL, png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return { ...out, png };
}
```

Change the `import.meta.main` entry block from:

```js
if (import.meta.main) {
  const out = writeSkillAtlas();
```

to:

```js
if (import.meta.main) {
  const out = await writeSkillAtlas();
```

- [ ] **Step 6: Regenerate the skills atlas and run the tests**

Run: `npm run pack:skills`
Expected: prints a byte count smaller than the previous 41712 (new committed
`public/textures/skills-atlas.png` is now the quantized PNG).

Then run: `npx vitest run tests/packSkills.test.mjs`
Expected: PASS — the sync test re-finalizes the generated lossless buffer and
byte-compares against the just-regenerated committed file.

- [ ] **Step 7: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tools/packSkills.mjs tests/packSkills.test.mjs public/textures/skills-atlas.png
git commit -m "feat: quantize skills atlas with pngquant when smaller"
```

---

### Task 2: Wire achievements atlas

**Files:**
- Modify: `tools/packAchievements.mjs`
- Modify: `tests/packAchievements.test.mjs`

**Interfaces:**
- Consumes: `finalizeAtlas` from `tools/packSkills.mjs` (already imported there? No — check; `packAchievements.mjs` imports only `decodePng, encodePng`; add `finalizeAtlas`).
- Produces: `writeAchievementAtlas` becomes async and writes the smaller of lossless/quantized.

- [ ] **Step 1: Update the failing sync test**

In `tests/packAchievements.test.mjs`, add `finalizeAtlas` to the import from `../tools/packSkills.mjs`:

```js
import { decodePng, finalizeAtlas } from '../tools/packSkills.mjs';
```

Change the test:

```js
  it('keeps the committed atlas PNG in sync with the packer output', () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const { png } = generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS);
    expect(Buffer.compare(committed, png)).toBe(0);
  });
```

to:

```js
  it('keeps the committed atlas PNG in sync with the packer output', async () => {
    const committed = readFileSync(fileURLToPath(ATLAS_URL));
    const final = await finalizeAtlas(generateAchievementAtlas(SOURCE_DIR_URL, ACHIEVEMENT_COLS).png);
    expect(Buffer.compare(committed, final)).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packAchievements.test.mjs`
Expected: FAIL — `finalizeAtlas` not imported/exposed yet from packSkills (it is; if it resolves, the committed atlas is still lossless, so the assertion fails).

- [ ] **Step 3: Implement async write**

In `tools/packAchievements.mjs`, update the import from `./packSkills.mjs`:

```js
import { decodePng, encodePng } from './packSkills.mjs';
```

to:

```js
import { decodePng, encodePng, finalizeAtlas } from './packSkills.mjs';
```

Change:

```js
export function writeAchievementAtlas() {
  const out = generateAchievementAtlas();
  writeFileSync(ATLAS_URL, out.png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return out;
}
```

to:

```js
export async function writeAchievementAtlas() {
  const out = generateAchievementAtlas();
  const png = await finalizeAtlas(out.png);
  writeFileSync(ATLAS_URL, png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return { ...out, png };
}
```

Change the `import.meta.main` block:

```js
if (import.meta.main) {
  const out = await writeAchievementAtlas();
```

- [ ] **Step 4: Regenerate the achievements atlas and check size**

Run: `npm run pack:achievements`
Expected: prints a byte count smaller than the previous 35308.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/packAchievements.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run full suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS. Watch for the `packSkills.test.mjs` and `packAchievements.test.mjs` sync tests both still passing against the regenerated (quantized) committed files.

- [ ] **Step 7: Commit**

```bash
git add tools/packAchievements.mjs tests/packAchievements.test.mjs public/textures/achievements-atlas.png
git commit -m "feat: quantize achievements atlas with pngquant when smaller"
```

---

## Self-Review

**Spec coverage:**
- `pngquant-bin` dev dep — Task 1 Step 1 ✓
- `compressPng` on in-memory buffer, temp dir, `execFile`, fallback on error — Task 1 Step 4 ✓
- Keep original if quantization is larger — `finalizeAtlas` (`quantized.length < png.length ? quantized : png`) ✓
- Async write functions — Tasks 1/2 ✓
- `generateX()` unchanged & lossless — untouched in both tasks ✓
- Runtime compatibility (palette color type 3 decodes in browser/Pixi) — no code needed, but noted so no RGBA-decode is attempted ✓
- Sync tests updated to compare against final output — Tasks 1/2 ✓

**Placeholders:** none — real code, exact commands.

**Type consistency:**
- `finalizeAtlas(png)` is exported from `packSkills.mjs` and imported by both test files and `packAchievements.mjs`; same name/semantics everywhere.
- `compressPng(input)` → `Promise<Buffer>`; `finalizeAtlas` uses `.length` on the results.
- `write*Atlas()` both return `{ ...out, png }`; both `import.meta.main` blocks use `await`.
- `.mjs` files: no TS type annotations in code blocks (plain JS).