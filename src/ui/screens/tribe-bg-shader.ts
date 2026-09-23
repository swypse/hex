import {
  colorBitGl,
  compileHighShaderGlProgram,
  ImageSource,
  localUniformBitGl,
  Matrix,
  roundPixelsBitGl,
  Shader,
  Texture,
} from 'pixi.js';
import { THEME } from '../kit/theme';

/** How far down the screen the tribe color has fully faded into the screen bg
 *  (fraction of the screen height; below this the bg is solid). */
export const TRIBE_BG_DEPTH = 0.2;
/** Cross-fade duration for the tribe-coloured background (ms). */
export const BG_FADE_MS = 200;

/** Fragment bit that replaces texture sampling with a vertical
 *  tribe-color → screen-bg gradient. The background Graphics carries a 1×1
 *  white texture fill (textureSpace 'local'), so `vUV.y` runs 0→1 down the
 *  rect; `uTopColor` is animated in place during the tribe cross-fade. */
const tribeGradientBit = {
  name: 'tribe-gradient',
  fragment: {
    header: /* glsl */ `
            uniform vec4 uTopColor;
            uniform vec4 uBg;
            uniform float uDepth;
        `,
    main: /* glsl */ `
            float depth = max(uDepth, 0.0001);
            float t = clamp(vUV.y / depth, 0.0, 1.0);
            outColor = vec4(mix(uTopColor.rgb, uBg.rgb, t), 1.0);
        `,
  },
};

/** A 1×1 white pixel shared by every tribe-background Graphics so the batcher
 *  emits real UVs (0→1 down the rect) for the fragment gradient. Built lazily;
 *  headless environments (tests) fall back to `Texture.EMPTY`, which still
 *  maps UVs because that only depends on the fill's textureMatrix. */
let whitePixel: Texture | null = null;

function whiteTexture(): Texture {
  if (whitePixel) return whitePixel;
  try {
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        whitePixel = new Texture({
          source: new ImageSource({ resource: canvas, addressMode: 'clamp-to-edge' }),
          label: 'tribe-bg-white',
        });
      }
    }
  } catch {
    // fall through to Texture.EMPTY below
  }
  return whitePixel ?? Texture.EMPTY;
}

/** The 1×1 white texture to fill the background `Graphics` with, so the custom
 *  shader's `vUV.y` spans the screen. */
export function tribeBackgroundTexture(): Texture {
  return whiteTexture();
}

function colorToRgba(color: number): Float32Array {
  return new Float32Array([
    ((color >> 16) & 0xff) / 255,
    ((color >> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    1,
  ]);
}

export interface TribeBackgroundShader {
  shader: Shader;
  /** Write a 0xRRGGBB color into the `uTopColor` uniform in place. */
  setTop(color: number): void;
  destroy(): void;
}

/** Builds the tribe-background renderer, once per screen. Run the tribe
 *  cross-fade by mutating the `uTopColor` uniform each tick — no gradient
 *  texture is rebuilt during the animation. */
export function makeTribeBackgroundShader(): TribeBackgroundShader {
  const glProgram = compileHighShaderGlProgram({
    name: 'tribe-bg',
    bits: [tribeGradientBit, colorBitGl, localUniformBitGl, roundPixelsBitGl],
  });
  const shader = new Shader({
    glProgram,
    resources: {
      localUniforms: {
        uTransformMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
        uColor: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
        uRound: { value: 0, type: 'f32' },
      },
      gradient: {
        uTopColor: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
        uBg: { value: colorToRgba(THEME.bg), type: 'vec4<f32>' },
        uDepth: { value: TRIBE_BG_DEPTH, type: 'f32' },
      },
    },
  });
  return {
    shader,
    setTop: (color: number): void => {
      const v = shader.resources.gradient.uniforms.uTopColor as Float32Array;
      v[0] = ((color >> 16) & 0xff) / 255;
      v[1] = ((color >> 8) & 0xff) / 255;
      v[2] = (color & 0xff) / 255;
      v[3] = 1;
    },
    destroy: (): void => shader.destroy(true),
  };
}