import { afterEach, describe, it, expect } from 'vitest';
import { TRIBE_BG_DEPTH, makeTribeBackgroundShader, tribeBackgroundTexture } from '../src/ui/screens/tribe-bg-shader';
import { THEME } from '../src/ui/kit/theme';

describe('tribe background shader', () => {
  let built: ReturnType<typeof makeTribeBackgroundShader> | null = null;

  afterEach(() => {
    built?.destroy();
    built = null;
  });

  it('compiles a WebGL gradient fragment that mixes tribe color into the bg by vUV.y', () => {
    const s = makeTribeBackgroundShader();
    built = s;
    const fragment = s.shader.glProgram?.fragment ?? '';
    expect(fragment).toContain('uTopColor');
    expect(fragment).toContain('uBg');
    expect(fragment).toContain('uDepth');
    expect(fragment).toContain('vUV.y');
    expect(fragment).toContain('mix(uTopColor.rgb, uBg.rgb, t)');
    // Clamped depth guards against divide-by-zero.
    expect(fragment).toContain('max(uDepth, 0.0001)');
    // The default fragment template still drives the final output colouring.
    expect(fragment).toContain('vec4 outColor');
    expect(fragment).toContain('finalColor = outColor * vColor');
  });

  it('defaults the gradient uniforms to the app background color and depth', () => {
    const s = makeTribeBackgroundShader();
    built = s;
    const g = s.shader.resources.gradient.uniforms;
    const bg = g.uBg as Float32Array;
    expect(bg[0]).toBeCloseTo(((THEME.bg >> 16) & 0xff) / 255);
    expect(bg[1]).toBeCloseTo(((THEME.bg >> 8) & 0xff) / 255);
    expect(bg[2]).toBeCloseTo((THEME.bg & 0xff) / 255);
    expect(g.uDepth).toBe(TRIBE_BG_DEPTH);
  });

  it('writes a 0xRRGGBB color into the uTopColor uniform in place', () => {
    const s = makeTribeBackgroundShader();
    built = s;
    s.setTop(0xff8c00);
    const v = s.shader.resources.gradient.uniforms.uTopColor as Float32Array;
    expect(v[0]).toBeCloseTo(1);
    expect(v[1]).toBeCloseTo(0x8c / 255);
    expect(v[2]).toBeCloseTo(0);
    expect(v[3]).toBe(1);
  });

  it('provides a 1x1 white texture for UV-aware fills', () => {
    const tex = tribeBackgroundTexture();
    expect(tex.width).toBe(1);
    expect(tex.height).toBe(1);
  });
});