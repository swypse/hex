import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { VILLAGE_VILLAGERS_ATLAS_FRAMES, VILLAGE_VILLAGERS_ATLAS_CELL_W, VILLAGE_VILLAGERS_ATLAS_CELL_H } from '../src/game/village-villagers-atlas-data.gen';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface VillageVillagersAtlasModule {
  ensureVillageVillagersAtlas: () => Promise<void>;
  villageVillagerFrameTexture: (key: string) => Texture | null;
}

describe('village-villagers atlas loader', () => {
  let atlas: VillageVillagersAtlasModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    atlas = await import('../src/render/village-build-atlas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the single packed village-villagers atlas image', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/village-villagers-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices a frame out of the atlas with the correct bounds', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = VILLAGE_VILLAGERS_ATLAS_FRAMES['t1']!;
    const tex = atlas.villageVillagerFrameTexture('t1');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(VILLAGE_VILLAGERS_ATLAS_CELL_W);
    expect(tex!.height).toBe(VILLAGE_VILLAGERS_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('returns null for an unknown frame key', async () => {
    const loading = atlas.ensureVillageVillagersAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(atlas.villageVillagerFrameTexture('nope')).toBeNull();
  });
});