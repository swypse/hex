import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { TRIBE_ATLAS_FRAMES, TRIBE_ATLAS_FILES, TRIBE_ATLAS_CELL_W, TRIBE_ATLAS_CELL_H } from '../src/game/tribe-atlas-data.gen';
import { ensureTribeAtlas, tribeTileTexture } from '../src/render/tribe-atlas';
import { TRIBES } from '../src/game/tribes';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface TribeAtlasModule {
  ensureTribeAtlas: (code: string) => Promise<void>;
  tribeTileTexture: (code: string, frameKey: string) => Texture | null;
}

describe('tribe atlas loader', () => {
  let atlas: TribeAtlasModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    atlas = await import('../src/render/tribe-atlas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves every playable tribe to an atlas file and frames', () => {
    for (const code of Object.keys(TRIBE_ATLAS_FILES)) {
      expect(TRIBE_ATLAS_FILES[code]).toBe(`${code}-atlas.png`);
      expect(Object.keys(TRIBE_ATLAS_FRAMES[code]!).length).toBeGreaterThan(0);
    }
  });

  it('packs a village texture pair for every playable tribe', () => {
    for (const tribe of TRIBES) {
      expect(TRIBE_ATLAS_FRAMES[tribe.code]?.[`${tribe.code}-village`]).toBeDefined();
      expect(TRIBE_ATLAS_FRAMES[tribe.code]?.[`${tribe.code}-village-2`]).toBeDefined();
    }
  });

  it('loads exactly the requested tribe atlas image', async () => {
    const loading = atlas.ensureTribeAtlas('cats');
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/cats-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('does not load any other tribe atlas when only one tribe is requested', async () => {
    const loading = atlas.ensureTribeAtlas('cats');
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(FakeImage.instances).toHaveLength(1);
  });

  it('slices a tribe frame out of the right tribe atlas with the correct bounds', async () => {
    const loading = atlas.ensureTribeAtlas('cats');
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = TRIBE_ATLAS_FRAMES['cats']!['cats-warrior']!;
    const tex = atlas.tribeTileTexture('cats', 'cats-warrior');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(TRIBE_ATLAS_CELL_W);
    expect(tex!.height).toBe(TRIBE_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('does not load and returns null for an unknown tribe code', async () => {
    await atlas.ensureTribeAtlas('zzz');
    expect(FakeImage.instances).toHaveLength(0);
    expect(atlas.tribeTileTexture('zzz', 'anything')).toBeNull();
  });

  it('returns null for a frame missing from the tribe atlas', async () => {
    const loading = atlas.ensureTribeAtlas('cats');
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(atlas.tribeTileTexture('cats', 'nope')).toBeNull();
  });
});