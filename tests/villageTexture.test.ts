import { describe, it, expect } from 'vitest';
import { villageTextureFor } from '../src/render/villageTexture';
import type { Texture } from 'pixi.js';
import { Tribe } from '../src/game/tribes';
import { villageTexturesForTest } from './helpers/villageTextures';

function tex(id: string): Texture {
  return { uid: id } as unknown as Texture;
}

const level1 = (id: string) => ({ texture: tex(id), anchorY: 0.7 });
const level2 = (id: string) => ({ texture: tex(id), anchorY: 0.7 });

const textures = {
  villageTextures: villageTexturesForTest(
    level1('v1'),
    level2('v2'),
  ),
  freeVillageTexture: { texture: tex('free'), anchorY: 0.7 },
};

// Give Cats distinct textures so the per-tribe selection is verifiable.
textures.villageTextures[Tribe.Cats] = {
  level1: level1('cat1'),
  level2: level2('cat2'),
};

describe('villageTextureFor', () => {
  it('returns null when there is no settlement', () => {
    expect(villageTextureFor(null, textures, Tribe.Villagers).texture).toBeNull();
  });

  it('uses the free village texture for unowned settlements', () => {
    const s = { owner: null, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures, Tribe.Villagers).texture).toBe(textures.freeVillageTexture.texture);
  });

  it('uses the tribe level1 texture for owned level-1 villages', () => {
    const s = { owner: 0, level: 1, captureReady: false };
    expect(villageTextureFor(s, textures, Tribe.Cats).texture).toBe(textures.villageTextures[Tribe.Cats].level1.texture);
    expect(villageTextureFor(s, textures, Tribe.Villagers).texture).toBe(textures.villageTextures[Tribe.Villagers].level1.texture);
  });

  it('uses the tribe level2 texture for owned villages level 2 and up', () => {
    const s2 = { owner: 0, level: 2, captureReady: false };
    const s3 = { owner: 0, level: 3, captureReady: false };
    expect(villageTextureFor(s2, textures, Tribe.Cats).texture).toBe(textures.villageTextures[Tribe.Cats].level2.texture);
    expect(villageTextureFor(s3, textures, Tribe.Cats).texture).toBe(textures.villageTextures[Tribe.Cats].level2.texture);
  });
});