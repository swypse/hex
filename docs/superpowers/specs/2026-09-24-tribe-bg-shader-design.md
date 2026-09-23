# Shader-driven Setup Screen Background (2026-09-24)

## Goal

The setup screen shows a full-screen vertical gradient: the selected tribe's color
at the top of the screen, fading into the app background (`THEME.bg`, `0x1a1a2e`) at
20% screen depth and staying solid below. When the player changes tribe, that top
color cross-fades over 200 ms.

Today the fade rebuilds a `FillGradient` texture every animation frame (~12 canvas
+ texture allocations per change). This design keeps the same visual but computes the
gradient inside a PixiJS custom shader: the animated value becomes a **uniform** that is
mutated in place per frame, with no per-frame texture work.

## Approach

Option 1a (approved): attach a custom `Shader` to the background `Graphics` via
`GraphicsContext.customShader`, with a texture-backed rect so `vUV` carries vertical
position. The fragment computes the tribe→bg gradient from `vUV.y` and two uniforms
(top color, bg color).

## Components

### `src/ui/screens/tribe-bg-shader.ts` (new)

A single-purpose module that owns the gradient shader:

- `FRAGMENT_TRIBE_BG` / `VERTEX_TRIBE_BG` GLSL source strings, and matching WGSL
  strings for the WebGPU program.

  Fragment core (WebGL flavor):

  ```glsl
  uniform vec4 uTopColor;
  uniform vec4 uBg;
  uniform float uDepth;

  in vec4 vColor;
  in vec2 vUV;

  void main() {
      float t = clamp(vUV.y / max(uDepth, 0.0001), 0.0, 1.0);
      vec4 color = mix(uTopColor, uBg, t);
      finalColor = color * vColor;
  }
  ```

  The vertex keeps the default batched-graphics vertex contract (`aPosition`,
  `aUV`, `aColor`, `aTextureIdAndRound`); the rect is filled with a 1×1 white
  texture using `textureSpace: 'local'` so the batcher emits real UVs that
  normalize 0→1 across the fill bounds (top→bottom maps to `vUV.y` ∈ [0,1];
  verified against `generateTextureFillMatrix`).

- `makeTribeBackgroundShader(): Shader` — creates the `GlProgram` (WebGL) and
  `GpuProgram` (WebGPU) via `Shader.from`, with a `gradient` `UniformGroup`
  (`uTopColor: vec4<f32>`, `uBg: vec4<f32>`, `uDepth: f32`), defaulting to
  `uTopColor = tribe color`, `uBg = THEME.bg`, `uDepth = TRIBE_BG_DEPTH`.

- `setTribeGradientTop(shader, color: number)` — writes the four color floats in
  place on `shader.resources.gradient.uniforms.uTopColor` (cheap, GC-free).

- `setTribeGradientDepth(shader, depth: number)` — writes `uDepth` (default
  `TRIBE_BG_DEPTH = 0.2`).

- `TRIBE_BG_DEPTH = 0.2`, `BG_FADE_MS = 200` exports.

### `src/ui/screens/setup-screen.ts` (modify)

- Replace the `FillGradient` background with a `Graphics` whose fill is a small
  white texture (1×1, `textureSpace: 'local'`, so `vUV` spans the rect 0→1) and
  assign `bg.context.customShader = makeTribeBackgroundShader()`.
- `paintBackground()` now sets the initial tribe color uniform (no texture build).
- `changeBackground(color)` tweens `uTopColor` from the previous tribe color to the
  new one over `BG_FADE_MS` using the existing app-ticker pattern (per-frame
  `setTribeGradientTop`), removing the `makeGradient`/gradient rebuild.
- `destroy()` releases the shader (`shader.destroy(true)`).
- Delete the now-unused `mixColor` import from the screen (kept in `util/color.ts`
  for the shader module / tests).

### `src/ui/kit/theme.ts` (no change)

`THEME.bg` already exists (`0x1a1a2e`) and is the fallback bottom colour.

## Data flow

1. `mount()` builds one `Graphics` bg + one `Shader`, assigns `customShader`,
   calls `setTribeGradientTop(initialTribeColor)`.
2. Tribe changed (click or arrow) → `setTribe(id)` → `changeBackground(color)`.
3. Tween: each tickler frame writes `uTopColor` floats in place.
4. Renderer draws the rect; the fragment mixes `uTopColor → uBg` by `vUV.y / uDepth`.
   No texture is created during the fade.

## Error handling

- If the renderer lacks a matching program (e.g. WebGPU without a GPU program), the
  shader simply isn't used by that renderer; Pixi reports a missing-program warning.
  The screen still shows the solid `THEME.bg` from the app background, so the UI is
  never black.
- `uDepth` is clamped in shader source to avoid a divide-by-zero.

## Testing

- New `tests/tribe-bg-shader.test.ts`:
  - both GLSL and WGSL sources contain `uTopColor`, `uBg`, `uDepth`, and the mix.
  - `makeTribeBackgroundShader` returns a Shader with a `gradient` uniform group
    whose defaults match `THEME.bg` / depth.
  - `setTribeGradientTop` and `setTribeGradientDepth` write the expected uniforms.
- `tests/setup-screen.test.ts`:
  - screen mounts with the shader attached (`bg.context.customShader` non-null).
  - tribe change registers a fade tween; advancing the tickler moves `uTopColor`.
  - existing mount / key tests keep passing.

## Out of scope

- WebGPU-only parity beyond the default-game path (game already runs WebGL-first).
- Applying the shader to other screens.