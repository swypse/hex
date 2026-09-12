import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ICONS16_ATLAS_FRAMES, ICONS16_ATLAS_CELL } from '../src/game/icons16AtlasData.gen';
import { ICONS16_FILES } from '../src/ui/kit/icons16';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface Icons16Module {
  ICONS16_FILES: Record<string, string>;
  makeIcon16: (key: string, size: number, onReady?: () => void) => { width: number; height: number; destroy: () => void; texture: unknown };
}

describe('makeIcon16', () => {
  let icons: Icons16Module;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/icons16');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every mapped key resolves to an atlas frame', () => {
    for (const key of Object.keys(ICONS16_FILES)) {
      expect(ICONS16_ATLAS_FRAMES[ICONS16_FILES[key]!]).not.toBeUndefined();
    }
  });

  it('maps a unitDescriptions icon path to its frame key', async () => {
    const icons16 = await import('../src/ui/kit/icons16');
    expect(icons16.icons16FrameForIconPath('16/hp-16.png')).toBe('hp-16');
    expect(icons16.icons16FrameForIconPath('16/move-16.png')).toBe('move-16');
  });

  it('loads the single packed icons-16 atlas image', () => {
    const sprite = icons.makeIcon16('help-16', 14);
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/icons-16-atlas.png`);
    expect(sprite.width).toBe(14);
    expect(sprite.height).toBe(14);
  });

  it('slices the icon region out of the atlas once it loads', () => {
    const sprite = icons.makeIcon16('hp-16', 16);
    const frame = ICONS16_ATLAS_FRAMES['hp-16']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ICONS16_ATLAS_CELL);
    expect(tex!.height).toBe(ICONS16_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('resolves a logical key to its atlas frame', () => {
    const sprite = icons.makeIcon16('help', 14);
    const frame = ICONS16_ATLAS_FRAMES['help-16']!;
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
  });

  it('does not touch the sprite when the image loads after the sprite was destroyed', () => {
    const sprite = icons.makeIcon16('hp-16', 16);
    sprite.destroy();
    const load = FakeImage.instances[0]!.onload!;
    expect(() => load.call(FakeImage.instances[0]!)).not.toThrow();
  });
});