import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { TERRAIN_ATLAS_FRAMES, TERRAIN_ATLAS_CELL_W, TERRAIN_ATLAS_CELL_H } from '../src/game/terrain-atlas-data.gen';
import { TERRAIN_TILE_FILES, TERRAIN_FOG_FILE } from '../src/render/terrain-atlas';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface TerrainAtlasModule {
  ensureTerrainAtlas: () => Promise<void>;
  terrainFrameTexture: (key: string) => Texture | null;
}

describe('terrain atlas loader', () => {
  let atlas: TerrainAtlasModule;

  beforeEach(async () => {
    FakeImage.instances = [];
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.spyOn(Texture, 'from').mockReturnValue(Texture.EMPTY);
    vi.resetModules();
    atlas = await import('../src/render/terrain-atlas');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('every terrain tile and fog frame resolves to an atlas frame', () => {
    for (const file of Object.values(TERRAIN_TILE_FILES)) {
      expect(TERRAIN_ATLAS_FRAMES[file]).not.toBeUndefined();
    }
    expect(TERRAIN_ATLAS_FRAMES[TERRAIN_FOG_FILE]).not.toBeUndefined();
  });

  it('packs the bonus, bottle and pirate-ship frames the factory consumes', () => {
    for (const frame of ['bonus', 'bottle-on-water', 'pirates-ship']) {
      expect(TERRAIN_ATLAS_FRAMES[frame]).not.toBeUndefined();
    }
  });

  it('loads the single packed terrain atlas image', async () => {
    const loading = atlas.ensureTerrainAtlas();
    expect(FakeImage.instances).toHaveLength(1);
    expect(FakeImage.instances[0]!.src).toBe(`${import.meta.env.BASE_URL}textures/terrain-atlas.png`);
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
  });

  it('slices a terrain frame out of the atlas with the correct bounds', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    const frame = TERRAIN_ATLAS_FRAMES['grassland-land']!;
    const tex = atlas.terrainFrameTexture('grassland-land');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(TERRAIN_ATLAS_CELL_W);
    expect(tex!.height).toBe(TERRAIN_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('returns null for an unknown frame key', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.instances[0]!.onload!.call(FakeImage.instances[0]!);
    await loading;
    expect(atlas.terrainFrameTexture('nope.png')).toBeNull();
  });
});