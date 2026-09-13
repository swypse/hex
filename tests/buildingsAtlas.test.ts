import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { BUILDINGS_ATLAS_FRAMES, BUILDINGS_ATLAS_CELL_W, BUILDINGS_ATLAS_CELL_H } from '../src/game/buildingsAtlasData.gen';
import { BUILDING_TILE_FILES } from '../src/render/buildingsAtlas';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface BuildingsAtlasModule {
  ensureBuildingsAtlas: () => Promise<void>;
  buildingTileTexture: (key: string) => Texture | null;
}

describe('buildings atlas loader', () => {
  let atlas: BuildingsAtlasModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    atlas = await import('../src/render/buildingsAtlas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every building frame resolves to an atlas frame', () => {
    for (const file of BUILDING_TILE_FILES) {
      expect(BUILDINGS_ATLAS_FRAMES[file]).not.toBeUndefined();
    }
  });

  it('loads the single packed buildings atlas image', async () => {
    const loading = atlas.ensureBuildingsAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/buildings-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices a building frame out of the atlas with the correct bounds', async () => {
    const loading = atlas.ensureBuildingsAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = BUILDINGS_ATLAS_FRAMES['mine']!;
    const tex = atlas.buildingTileTexture('mine');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(BUILDINGS_ATLAS_CELL_W);
    expect(tex!.height).toBe(BUILDINGS_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('returns null for an unknown frame key', async () => {
    const loading = atlas.ensureBuildingsAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(atlas.buildingTileTexture('nope')).toBeNull();
  });
});