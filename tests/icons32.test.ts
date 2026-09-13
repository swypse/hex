import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture } from 'pixi.js';
import { ICONS32_ATLAS_FRAMES, ICONS32_ATLAS_CELL } from '../src/game/icons32AtlasData.gen';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface Icons32Module {
  ensureIcons32Atlas: () => Promise<void>;
  makeIcon32: (key: string, size: number) => { width: number; height: number; destroy: () => void; texture: unknown };
  icons32FrameTexture: (key: string) => Texture | null;
}

describe('icons-32 atlas loader', () => {
  let icons: Icons32Module;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    icons = await import('../src/ui/kit/icons32');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packs the buff and village-connected icon frames the game consumes', () => {
    for (const frame of ['water-protection-32', 'forest-protection-32', 'village-connected-32']) {
      expect(ICONS32_ATLAS_FRAMES[frame]).not.toBeUndefined();
    }
  });

  it('packs the resource icon frames the HUD consumes', () => {
    for (const frame of ['gold-32', 'wood-32', 'stone-32', 'ore-32']) {
      expect(ICONS32_ATLAS_FRAMES[frame]).not.toBeUndefined();
    }
  });

  it('loads the single packed icons-32 atlas image', async () => {
    const loading = icons.ensureIcons32Atlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/icons-32-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices an icon out of the atlas with the correct bounds', async () => {
    const loading = icons.ensureIcons32Atlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const sprite = icons.makeIcon32('water-protection-32', 40);
    const frame = ICONS32_ATLAS_FRAMES['water-protection-32']!;
    const tex = (sprite as { texture: Texture | null }).texture;
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(ICONS32_ATLAS_CELL);
    expect(tex!.height).toBe(ICONS32_ATLAS_CELL);
    expect(tex!.frame.x).toBe(frame.x);
    expect(tex!.frame.y).toBe(frame.y);
    expect(sprite.width).toBe(40);
  });

  it('returns null for a frame not in the atlas', async () => {
    const loading = icons.ensureIcons32Atlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(icons.icons32FrameTexture('nope')).toBeNull();
  });
});