import { describe, it, expect, vi } from 'vitest';
import { TileType } from '../src/game/tile-types';
import { MapTile } from '../src/game/map-gen';
import { tileElevation } from '../src/render/elevation';
import { coastWaterBrightness, destroyTextureSet, suppressPixiWarnings, type TextureSet } from '../src/render/texture-factory';

function tile(terrain: TileType, height: number): MapTile {
  return {
    q: 0,
    r: 0,
    terrain,
    height,
    settlement: null,
    unit: null,
    ownedBy: null,
    claimedByVillage: null,
    building: null,
  };
}

describe('tileElevation', () => {
  it('renders water flat at height 0 regardless of its per-tile height', () => {
    expect(tileElevation(tile(TileType.Water, 0.5), 40)).toBe(0);
    expect(tileElevation(tile(TileType.Water, 0.1), 40)).toBe(0);
    expect(tileElevation(tile(TileType.Water, 0.9), 40)).toBe(0);
  });

  it('raises land and mountain tiles by their height in 8px steps', () => {
    expect(tileElevation(tile(TileType.GrasslandLand, 0.5), 40)).toBeCloseTo(24);
    expect(tileElevation(tile(TileType.GrasslandMountain, 0.25), 40)).toBeCloseTo(8);
  });

  it('is resolution-independent: same screen elevation at any generation hexSize', () => {
    // texture generated at hexSize=120 is scaled by 1/3 on screen; border uses hexSize=40
    for (const h of [0.2, 0.35, 0.5, 0.55, 0.75]) {
      expect(tileElevation(tile(TileType.GrasslandLand, h), 120) / 3).toBe(
        tileElevation(tile(TileType.GrasslandLand, h), 40),
      );
    }
  });

  it('treats a missing height as 0', () => {
    expect(tileElevation(tile(TileType.GrasslandLand, 0), 40)).toBe(0);
  });
});

describe('coastWaterBrightness', () => {
  const water = { terrain: TileType.Water as TileType, q: 0, r: 0 };
  const land = { terrain: TileType.GrasslandLand as TileType, q: 1, r: 0 };
  const map = new Map([
    ['0,0', water],
    ['1,0', land],
    ['0,1', water],
  ]);
  const find = (q: number, r: number): MapTile | undefined => map.get(`${q},${r}`) as MapTile | undefined;

  it('brightens water adjacent to land', () => {
    expect(coastWaterBrightness(water, find)).toBe(1.5);
  });

  it('keeps open water (no land neighbor) at factor 1', () => {
    const open: typeof water = { terrain: TileType.Water, q: 0, r: 2 };
    expect(coastWaterBrightness(open, find)).toBe(1);
  });

  it('does not brighten water that only touches ice', () => {
    const iceMap = new Map<string, { terrain: TileType }>([['1,0', { terrain: TileType.Ice }]]);
    const findIce = (q: number, r: number) => iceMap.get(`${q},${r}`) as MapTile | undefined;
    expect(coastWaterBrightness(water, findIce)).toBe(1);
  });

  it('keeps land tiles at factor 1', () => {
    expect(coastWaterBrightness(land, find)).toBe(1);
  });
});

describe('destroyTextureSet warning mitigation', () => {
  const BIND_GROUP_WARNING =
    "[BindGroup] a 'textureSource' was destroyed while still bound to a shader. Remove it from the shader before destroying it.";

  it('suppresses Pixi bind-group teardown warnings but keeps other warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const textures = {
        ownedTextures: [
          { destroyed: false, destroy: (): void => { console.warn(BIND_GROUP_WARNING); } },
          { destroyed: false, destroy: (): void => { console.warn('unrelated pixel warning'); } },
          { destroyed: true, destroy: vi.fn() },
        ],
      } as unknown as TextureSet;
      destroyTextureSet(textures);
      expect(textures.ownedTextures).toEqual([]);
      // Only the non-Pixi warning reached the console.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('unrelated pixel warning');
      expect(warn).not.toHaveBeenCalledWith(BIND_GROUP_WARNING);
    } finally {
      warn.mockRestore();
    }
  });

  it('restores console.warn after running the suppressed block', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    suppressPixiWarnings(() => { console.warn(BIND_GROUP_WARNING); }, 'was destroyed while still bound to a shader');
    expect(warn).not.toHaveBeenCalled();
    console.warn('after restore');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('after restore');
    warn.mockRestore();
  });
});
