import { beforeEach, describe, it, expect, afterEach, vi } from 'vitest';
import { Texture, type Container } from 'pixi.js';
import { TERRAIN_ATLAS_FRAMES, TERRAIN_ATLAS_CELL_W, TERRAIN_ATLAS_CELL_H } from '../src/game/terrain-atlas-data.gen';
import { TERRAIN_BIOME_ATLASES } from '../src/game/terrain-biomes-data.gen';
import { TERRAIN_TILE_FILES, TERRAIN_FOG_FILE } from '../src/render/terrain-atlas';

class FakeImage {
  src = '';
  onload: (() => void) | null = null;
  static instances: FakeImage[] = [];
  static loadAll() {
    for (const img of FakeImage.instances) img.onload!.call(img);
  }

  constructor() {
    FakeImage.instances.push(this);
  }
}

interface TerrainAtlasModule {
  ensureTerrainAtlas: () => Promise<void>;
  terrainFrameTexture: (key: string) => Texture | null;
  terrainTileTexture: (key: string, season?: string) => Texture | null;
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
      const biome = file.split('-')[0]!;
      const inBiome = TERRAIN_BIOME_ATLASES[biome]?.frames[`${file}-spring`];
      expect(inBiome ?? TERRAIN_ATLAS_FRAMES[file]).not.toBeUndefined();
    }
    expect(TERRAIN_ATLAS_FRAMES[TERRAIN_FOG_FILE]).not.toBeUndefined();
  });

  it('packs the bonus, bottle and pirate-ship frames the factory consumes', () => {
    for (const frame of ['bonus', 'bottle-on-water', 'pirates-ship']) {
      expect(TERRAIN_ATLAS_FRAMES[frame]).not.toBeUndefined();
    }
  });

  it('loads the generic terrain atlas plus one atlas image per biome', async () => {
    const loading = atlas.ensureTerrainAtlas();
    const base = `${import.meta.env.BASE_URL}textures/`;
    const expected = [
      `${base}terrain-atlas.png`,
      ...Object.values(TERRAIN_BIOME_ATLASES).map((a) => base + a.file),
    ];
    expect(FakeImage.instances.map((i) => i.src).sort()).toEqual(expected.sort());
    FakeImage.loadAll();
    await loading;
  });

  it('every biome tile type has a spring frame in its biome atlas', () => {
    for (const file of Object.values(TERRAIN_TILE_FILES)) {
      const biome = file.split('-')[0]!;
      if (!TERRAIN_BIOME_ATLASES[biome]) continue;
      expect(TERRAIN_BIOME_ATLASES[biome]!.frames[`${file}-spring`]).not.toBeUndefined();
    }
  });

  it('uses the season texture when it exists, else the spring one', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.loadAll();
    await loading;
    const frameX = (tex: Texture | null) => (tex as unknown as { frame: { x: number; y: number } }).frame;
    const winter = TERRAIN_BIOME_ATLASES['grassland']!.frames['grassland-land-winter']!;
    expect(frameX(atlas.terrainTileTexture('grassland-land', 'winter'))).toMatchObject({ x: winter.x, y: winter.y });
    const spring = TERRAIN_BIOME_ATLASES['desert']!.frames['desert-land-spring']!;
    expect(frameX(atlas.terrainTileTexture('desert-land', 'winter'))).toMatchObject({ x: spring.x, y: spring.y });
  });

  it('serves biome tiles from their own atlas and falls back for non-biome tiles', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.loadAll();
    await loading;
    const frame = TERRAIN_BIOME_ATLASES['desert']!.frames['desert-land-spring']!;
    const tex = atlas.terrainTileTexture('desert-land');
    expect(tex).not.toBeNull();
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect(tex).not.toBe(atlas.terrainFrameTexture('desert-land'));
    // water has no biome atlas -> generic atlas frame
    expect(atlas.terrainTileTexture('water')).toBe(atlas.terrainFrameTexture('water'));
  });

  it('slices a terrain frame out of the atlas with the correct bounds', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.loadAll();
    await loading;
    const frame = TERRAIN_ATLAS_FRAMES['water']!;
    const tex = atlas.terrainFrameTexture('water');
    expect(tex).not.toBeNull();
    expect(tex!.width).toBe(TERRAIN_ATLAS_CELL_W);
    expect(tex!.height).toBe(TERRAIN_ATLAS_CELL_H);
    expect((tex as unknown as { frame: Container }).frame.x).toBe(frame.x);
    expect((tex as unknown as { frame: Container }).frame.y).toBe(frame.y);
  });

  it('returns null for an unknown frame key', async () => {
    const loading = atlas.ensureTerrainAtlas();
    FakeImage.loadAll();
    await loading;
    expect(atlas.terrainFrameTexture('nope.png')).toBeNull();
  });
});