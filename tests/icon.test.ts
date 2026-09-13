import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { makeIcon } from '../src/ui/kit/icon';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

describe('makeIcon', () => {
  beforeEach(() => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = makeIcon('x.png', 32);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });

  it('renders tribe icons from the packed atlas instead of separate files', () => {
    const sprite = makeIcon('cats-icon.png', 32);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src.endsWith('textures/tribe-icons-atlas.png')).toBe(true);
    expect(FakeImage.instances[0]!.src.endsWith('cats-icon.png')).toBe(false);
  });

  it('still loads non-tribe icons as individual files', () => {
    const sprite = makeIcon('bottle.png', 32);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src.endsWith('textures/bottle.png')).toBe(true);
  });
});
