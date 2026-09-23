# Atlas PNG Quantization Design

Date: 2026-09-12

## Goal

Shrink the generated atlas PNGs (`skills-atlas.png`, `achievements-atlas.png`)
to roughly half their current size, matching the lossy palette-quantization that
online tools (tinypng) achieve, by post-processing the encoder output with
`pngquant` — while never making an atlas larger.

## Current state

`tools/packSkills.mjs` (skills) and `tools/packAchievements.mjs`
(achievements) already encode losslessly: zlib `level 9` + per-row filter
heuristic. Measured sizes: skills 41 712 B, achievements 35 308 B. No zlib
option improves on that baseline. The atlases have ~1 400–2 200 *visible*
colors, so a lossless encoder cannot reach the ~50–60% reduction; only palette
quantization can.

## Approach

Use `pngquant-bin` (dev dependency, build-time only) to quantize the encoded
atlas buffer in memory, and keep the original whenever quantization fails or
does not shrink the file. Run it directly — not via the stale
`compress-images` wrapper — because `compress-images` is 5 years unmaintained,
wraps the same external binaries, and operates on the filesystem rather than
in-memory buffers.

### Dependency

- `pngquant-bin` → `devDependencies`. Ships statically-linked Linux binaries;
  default export is the path to the binary, invoked with `node:child_process`
  `execFile`. (README notes it expects `libimagequant-dev` on some platforms;
  Linux binaries are statically linked.) The game runtime never imports it.

### New helper in `tools/packSkills.mjs`

```js
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import pngquant from 'pngquant-bin';

export async function compressPng(input: Buffer): Promise<Buffer>
```

- Create a temp dir (`mkdtempSync()`), write `input` to `in.png`.
- Run `execFile(pngquant, ['--quality=20-50', '--force', inPath, '-o', outPath])`.
- Read `outPath`; `rmSync` both files and the temp dir (try/finally).
- Return the quantized buffer — or, on any error (binary missing, palette not
  produced, unsupported image), **return the original `input` buffer**. The
  helper never throws to its caller and never shrinks below quality guarantees;
  it simply falls back.

### Wiring in both pack scripts

`writeSkillAtlas` (in `packSkills.mjs:248`) and `writeAchievementAtlas` (in
`packAchievements.mjs:75`) become async (they already run under `npm run`, and
`import.meta.main` entry points call them):

```js
export async function writeSkillAtlas() {
  const out = generateSkillAtlas();
  const quantized = await compressPng(out.png);
  const png = quantized.length < out.png.length ? quantized : out.png;
  writeFileSync(ATLAS_URL, png);
  writeFileSync(MANIFEST_URL, out.manifestTs);
  return out;
}
```

`generateSkillAtlas` / `generateAchievementAtlas` (pure in-memory, used by the
existing merge-tests / imports) stay unchanged and still return the lossless
`png` buffer — quantization is applied only at write time.

## Runtime compatibility

pngquant output is an 8-bit palette PNG (color type 3). Browsers and Pixi
`ImageSource` decode palette PNGs identically, so the atlases load unchanged at
runtime. The tool's own `decodePng` only reads the *source* icon PNGs (always
RGBA color type 6), never the quantized atlas, so no decoder change is needed.

## Tests / verification

- No unit tests for `tools/*.mjs` (none exist today for these scripts).
- Verification is manual + CI-less by design (per user): run
  `npm install` (adds `pngquant-bin`), then `npm run pack:skills` and
  `npm run pack:achievements`; confirm the printed byte counts are smaller than
  the current 41 712 / 35 308 and that `npm run dev` still renders the skill and
  achievement icons.
- Because the assistant does no post-generation visual verification (per user):
  the fallback-to-original guard and the size comparison are the only required
  correctness checks.

## Out of scope

- No change to source icon PNGs or their palette.
- No change to the manifest generators, frame layout, or `decodePng`.
- No lossless filter heuristics changes (kept as-is).
- No webp/other format conversion.