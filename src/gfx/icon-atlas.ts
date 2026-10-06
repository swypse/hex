import { Sprite, type Texture } from 'pixi.js';
import { type AtlasSpec, createAtlas } from './atlas';
import { markDirty } from './render-gate';

export interface IconAtlas {
  ensure(): Promise<void>;
  frameTexture(key: string): Texture | null;
  /** An icon sprite sized `size`; its texture arrives once the atlas has loaded. */
  makeSprite(key: string, size: number, onReady?: () => void): Sprite;
}

/** A square-cell icon atlas that hands out sized sprites. */
export function createIconAtlas(spec: AtlasSpec): IconAtlas {
  const atlas = createAtlas(spec);

  function makeSprite(key: string, size: number, onReady?: () => void): Sprite {
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    sprite.width = size;
    sprite.height = size;
    const apply = (): boolean => {
      const tex = atlas.frameTexture(key);
      if (!tex) return false;
      sprite.texture = tex;
      // Re-apply the size after assigning the sliced texture: the size set
      // above was against the empty texture, which would otherwise leave an
      // absurd scale.
      sprite.width = size;
      sprite.height = size;
      return true;
    };
    if (atlas.isLoaded) {
      apply();
      onReady?.();
      return sprite;
    }
    atlas.whenLoaded(() => {
      if (sprite.destroyed) return;
      // The atlas arrived asynchronously outside any store/interaction: ask
      // for a frame so the icon appears without a pointer event.
      if (apply()) markDirty();
      onReady?.();
    });
    return sprite;
  }

  return { ensure: atlas.ensure, frameTexture: atlas.frameTexture, makeSprite };
}
