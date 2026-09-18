import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { TRIBE_ICONS_ATLAS_FRAMES, TRIBE_ICONS_ATLAS_CELL } from '../src/game/tribe-icons-atlas-data.gen';
import { TRIBES } from '../src/game/tribes';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface TribeIconsModule {
  ensureTribeIconsAtlas: () => Promise<void>;
  makeTribeIcon: (key: string, size: number, onReady?: () => void) => { width: number; height: number; destroy: () => void; texture: unknown };
}

describe('tribe icons atlas loader', () => {
  let icons: TribeIconsModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/tribe-icons');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packs an icon frame for every playable tribe', () => {
    for (const tribe of TRIBES) {
      expect(TRIBE_ICONS_ATLAS_FRAMES[`${tribe.code}-icon`]).not.toBeUndefined();
    }
  });

  it('loads the single packed tribe-icons atlas image', async () => {
    const loading = icons.ensureTribeIconsAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/tribe-icons-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices a tribe icon out of the atlas with the correct bounds', async () => {
    const loading = icons.ensureTribeIconsAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const sprite = icons.makeTribeIcon('cats-icon', 40);
    const frame = TRIBE_ICONS_ATLAS_FRAMES['cats-icon']!;
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(TRIBE_ICONS_ATLAS_CELL);
    expect(tex!.height).toBe(TRIBE_ICONS_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
    expect(sprite.width).toBe(40);
  });

  it('does not touch the sprite when the atlas loads after the sprite was destroyed', () => {
    const sprite = icons.makeTribeIcon('cats-icon', 40);
    sprite.destroy();
    expect(() => FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!)).not.toThrow();
  });
});