import { describe, it, expect, vi } from 'vitest';
import {
  VILLAGE_BUILD_WIDTH,
  villageBuildAnchorY,
  villageBuildFrames,
  villageBuildHeight,
  villageBuildSignature,
  VillageBuildTextureCache,
  acquireVillageBuildTexture,
  releaseVillageBuildTexture,
} from '../src/render/village-build-texture';
import type { SettlementBuild } from '../src/game/map-gen';

describe('villageBuildFrames', () => {
  it('level 1: eight top t1 blocks in draw order at column origins', () => {
    const { frames, width, height } = villageBuildFrames(1);
    expect(width).toBe(VILLAGE_BUILD_WIDTH);
    expect(height).toBe(130);
    expect(frames).toEqual([
      { x: 50, y: -20, frameKey: 't1' },
      { x: 75, y: -10, frameKey: 't1' },
      { x: 100, y: 0, frameKey: 't1' },
      { x: 75, y: 10, frameKey: 't1' },
      { x: 25, y: -10, frameKey: 't1' },
      { x: 0, y: 0, frameKey: 't1' },
      { x: 25, y: 10, frameKey: 't1' },
      { x: 50, y: 20, frameKey: 't1' },
    ]);
  });

  it('level 2: tall columns rise by one 28px step, bottoms stay put', () => {
    const build: SettlementBuild = {
      l: [[], ['m1'], ['m1']],
      r: [['m1'], ['m1']],
      lBack: [[], []],
      rBack: [[]],
    };
    const { frames, height } = villageBuildFrames(2, build);
    expect(frames).toHaveLength(12);
    expect(height).toBe(138);
    // The tall columns (left 2, left 3, right 1, right 2) add a below-top
    // block: the recorded m1 at the ground line, the t1 28px above (a 62px
    // vertical overlap of the two 90px blocks). Blocks emit bottom-first per
    // column so the upper block covers the lower one. Back-left 2 renders
    // below back-right 1.
    expect(frames[0]!).toEqual({ x: 50, y: -20, frameKey: 't1' });
    expect(frames[1]!).toEqual({ x: 75, y: -10, frameKey: 't1' });
    expect(frames[2]!).toEqual({ x: 100, y: 0, frameKey: 'm1' });
    expect(frames[3]!).toEqual({ x: 100, y: -28, frameKey: 't1' });
    expect(frames[4]!).toEqual({ x: 75, y: 10, frameKey: 'm1' });
    expect(frames[5]!).toEqual({ x: 75, y: -18, frameKey: 't1' });
    expect(frames[6]!).toEqual({ x: 25, y: -10, frameKey: 't1' });
    expect(frames[7]!).toEqual({ x: 0, y: 0, frameKey: 't1' });
    expect(frames[8]!).toEqual({ x: 25, y: 10, frameKey: 'm1' });
    expect(frames[9]!).toEqual({ x: 25, y: -18, frameKey: 't1' });
    expect(frames[10]!).toEqual({ x: 50, y: 20, frameKey: 'm1' });
    expect(frames[11]!).toEqual({ x: 50, y: -8, frameKey: 't1' });
  });

  it('level 3: uses recorded variants; back columns read lBack/rBack', () => {
    const build: SettlementBuild = {
      l: [['m2'], ['m1'], ['m1']],
      r: [['m1'], ['m1']],
      lBack: [['m1'], ['m1']],
      rBack: [['m1']],
    };
    const { frames } = villageBuildFrames(3, build);
    expect(frames).toHaveLength(16);
    expect(frames[0]!.frameKey).toBe('m1');
    expect(frames[1]!.frameKey).toBe('t1');
    expect(frames[2]!.frameKey).toBe('m1');
    expect(frames[3]!.frameKey).toBe('t1');
    expect(frames[10]!.frameKey).toBe('m2');
    expect(frames[11]!.frameKey).toBe('t1');
    expect(frames[12]!.frameKey).toBe('m1');
    expect(frames[15]!.frameKey).toBe('t1');
  });

  it('falls back to m1 for a missing build (older saves)', () => {
    const { frames } = villageBuildFrames(3);
    expect(frames[0]!.frameKey).toBe('m1');
    expect(frames[1]!.frameKey).toBe('t1');
    expect(frames[8]!.frameKey).toBe('m1');
    expect(frames[9]!.frameKey).toBe('t1');
  });

  it('level 5: every column has three blocks', () => {
    const { frames, height } = villageBuildFrames(5);
    expect(frames).toHaveLength(24);
    expect(height).toBe(186);
  });

  it('height grows when the back columns gain blocks', () => {
    expect(villageBuildHeight(1)).toBe(130);
    expect(villageBuildHeight(2)).toBe(138);
    expect(villageBuildHeight(3)).toBe(158);
    expect(villageBuildHeight(4)).toBe(166);
    expect(villageBuildHeight(5)).toBe(186);
  });
});

describe('villageBuildSignature', () => {
  it('distinguishes level and every column variant', () => {
    const a: SettlementBuild = { l: [['m1'], [], []], r: [[], []] };
    const b: SettlementBuild = { l: [['m2'], [], []], r: [[], []] };
    const c: SettlementBuild = { l: [['m1'], [], []], r: [[], []], lBack: [['m2'], []] };
    expect(villageBuildSignature(2, a)).toBe('2|m1;;|;||');
    expect(villageBuildSignature(2, a)).not.toBe(villageBuildSignature(2, b));
    expect(villageBuildSignature(2, c)).not.toBe(villageBuildSignature(2, a));
    expect(villageBuildSignature(2, a)).not.toBe(villageBuildSignature(3, a));
    expect(villageBuildSignature(2, undefined)).toBe('2|-');
  });
});

describe('villageBuildAnchorY', () => {
  const groundOffset = villageBuildHeight(1) / 2;

  it('keeps the composite bottom a fixed gap below the hex-center anchor on every level', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const height = villageBuildHeight(level);
      expect(height * (1 - villageBuildAnchorY(height))).toBeCloseTo(groundOffset, 10);
    }
  });

  it('keeps the level-1 centered look', () => {
    expect(villageBuildAnchorY(villageBuildHeight(1))).toBe(0.5);
  });

  it('raises the anchor as the village grows taller', () => {
    expect(villageBuildAnchorY(villageBuildHeight(5))).toBeGreaterThan(villageBuildAnchorY(villageBuildHeight(1)));
  });
});

describe('VillageBuildTextureCache reference counting', () => {
  function fakeTexture(): { destroy: ReturnType<typeof vi.fn> } {
    return { destroy: vi.fn() };
  }

  const tone = (texture: { destroy: ReturnType<typeof vi.fn> }) =>
    texture as unknown as import('pixi.js').Texture;

  const tile = (texture: { destroy: ReturnType<typeof vi.fn> }) => ({
    texture: tone(texture),
    anchorY: 0.7,
  });

  it('keeps a texture alive while any holder uses it and destroys it on the last release', () => {
    const cache = new VillageBuildTextureCache();
    const ta = fakeTexture();
    const tb = fakeTexture();
    cache.register('1|-', tile(ta));
    cache.register('2|-', tile(tb));

    // Two tiles display the level-1 bake.
    cache.acquire(tone(ta));
    cache.acquire(tone(ta));
    // Upgrade the first tile: it drops level 1 and adopts level 2.
    cache.acquire(tone(tb));
    cache.release(tone(ta));
    expect(ta.destroy).not.toHaveBeenCalled();
    expect(cache.tileFor('1|-')).not.toBeNull();

    // The other tile upgrades away too — nobody uses level 1 anymore.
    cache.release(tone(ta));
    expect(ta.destroy).toHaveBeenCalledWith(true);
    expect(cache.tileFor('1|-')).toBeNull();
    // Level 2 is still held by the first tile.
    expect(tb.destroy).not.toHaveBeenCalled();
    expect(cache.tileFor('2|-')).not.toBeNull();

    cache.release(tone(tb));
    expect(tb.destroy).toHaveBeenCalledWith(true);
    expect(cache.tileFor('2|-')).toBeNull();
  });

  it('evicts and destroys immediately when a lone holder releases', () => {
    const cache = new VillageBuildTextureCache();
    const t = fakeTexture();
    cache.register('3|-', tile(t));
    cache.acquire(tone(t));
    cache.release(tone(t));
    expect(t.destroy).toHaveBeenCalledWith(true);
    expect(cache.size).toBe(0);
  });

  it('destroyAll destroys every cached texture and empties the cache', () => {
    const cache = new VillageBuildTextureCache();
    const a = fakeTexture();
    const b = fakeTexture();
    cache.register('1|-', tile(a));
    cache.register('2|-', tile(b));
    cache.acquire(tone(a));
    cache.acquire(tone(a));
    cache.acquire(tone(b));
    cache.destroyAll();
    expect(a.destroy).toHaveBeenCalledWith(true);
    expect(b.destroy).toHaveBeenCalledWith(true);
    expect(cache.size).toBe(0);
    expect(cache.tileFor('1|-')).toBeNull();
  });

  it('acquire on a guarded texture is a no-op', () => {
    const cache = new VillageBuildTextureCache();
    const t = fakeTexture();
    cache.acquire(tone(t));
    cache.release(tone(t));
    expect(t.destroy).not.toHaveBeenCalled();
  });
});

describe('acquireVillageBuildTexture / releaseVillageBuildTexture', () => {
  it('are no-ops for textures the service did not bake', () => {
    const texture = { destroy: vi.fn() } as unknown as import('pixi.js').Texture;
    acquireVillageBuildTexture(texture);
    releaseVillageBuildTexture(texture);
    expect(texture.destroy).not.toHaveBeenCalled();
  });
});