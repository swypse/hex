import { describe, expect, it } from 'vitest';

import { adoptTerrainTextures, type TerrainTextures, type TextureSet } from '../src/render/texture-factory';
import { IcePhase, Season } from '@enums';

const tex = (n: string) => ({ n }) as never;
const tile = (t: unknown) => ({ texture: t, anchorY: 1 }) as never;

describe('adoptTerrainTextures', () => {
  it('swaps terrain and fog, updates the bake keys and returns the superseded textures', () => {
    const oldTile = tex('old-tile');
    const oldFog = tex('old-fog');
    const unit = tex('unit');
    const live = {
      season: Season.AUTUMN, iceTiles: 0, icePhase: IcePhase.NONE,
      ownedTextures: [oldTile, oldFog, unit],
      tileTextures: new Map([['0,0', tile(oldTile)]]),
      fogTextures: new Map([['0,0', tile(oldFog)]]),
    } as unknown as TextureSet;
    const newTile = tex('new-tile');
    const newFog = tex('new-fog');
    const fresh = {
      season: Season.WINTER, iceTiles: 3, icePhase: IcePhase.CRACKED,
      ownedTextures: [newTile, newFog],
      tileTextures: new Map([['0,0', tile(newTile)]]),
      fogTextures: new Map([['0,0', tile(newFog)]]),
    } as unknown as TerrainTextures;

    const superseded = adoptTerrainTextures(live, fresh);

    expect(new Set(superseded)).toEqual(new Set([oldTile, oldFog]));
    expect(live.tileTextures.get('0,0')!.texture).toBe(newTile);
    expect(live.fogTextures.get('0,0')!.texture).toBe(newFog);
    expect([live.season, live.iceTiles, live.icePhase]).toEqual([Season.WINTER, 3, IcePhase.CRACKED]);
    expect(live.ownedTextures).toEqual([unit, newTile, newFog]);
  });
});
