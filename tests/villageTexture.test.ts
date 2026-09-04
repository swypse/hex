import { describe, it, expect } from 'vitest';
import { villageTextureFor } from '../src/render/villageTexture';
import type { Texture } from 'pixi.js';

function tex(id: string): Texture {
  return { uid: id } as unknown as Texture;
}

const textures = {
  villageTextures: {
    level1: { texture: tex('v1'), anchorY: 0.7 },
    level2: { texture: tex('v2'), anchorY: 0.7 },
  },
  freeVillageTexture: { texture: tex('free'), anchorY: 0.7 },
};

describe('villageTextureFor', () => {
  it('returns null when there is no settlement', () => {
    expect(villageTextureFor(null, textures).texture).toBeNull();
  });

  it('uses the free village texture for unowned settlements', () => {
    const s = { owner: null, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures).texture).toBe(textures.freeVillageTexture.texture);
    expect(villageTextureFor(s, textures).anchorY).toBe(0.7);
  });

  it('uses the level1 texture for owned level-1 villages', () => {
    const s = { owner: 0, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures).texture).toBe(textures.villageTextures.level1.texture);
  });

  it('uses the level2 texture for owned villages level 2 and up', () => {
    const s2 = { owner: 0, level: 2, captureReady: false };
    const s3 = { owner: 0, level: 3, captureReady: false };
    expect(villageTextureFor(s2, textures).texture).toBe(textures.villageTextures.level2.texture);
    expect(villageTextureFor(s3, textures).texture).toBe(textures.villageTextures.level2.texture);
  });
});
