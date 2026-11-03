import { describe, it, expect } from 'vitest';
import { villageTextureFor } from '../src/render/village-texture';
import type { Texture } from 'pixi.js';
import { Tribe } from '../src/game/tribes';

function tex(id: string): Texture {
  return { uid: id } as unknown as Texture;
}

const textures = {
  freeVillageTexture: { texture: tex('free'), anchorY: 0.7 },
};

describe('villageTextureFor', () => {
  it('returns null when there is no settlement', () => {
    expect(villageTextureFor(null, textures, Tribe.Villagers).texture).toBeNull();
  });

  it('uses the free village texture for unowned settlements', () => {
    const s = { owner: null, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures, Tribe.Villagers).texture).toBe(textures.freeVillageTexture.texture);
  });

  it('falls back to the free village texture for owned villages without a composite service', () => {
    const s = { owner: 0, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures, Tribe.Cats).texture).toBe(textures.freeVillageTexture.texture);
  });
});