import { describe, it, expect } from 'vitest';
import { tileElevation } from '../src/render/elevation';
import { TileType } from '../src/game/tile-types';
import type { MapTile } from '../src/game/map-gen';

const tile = (terrain: TileType): MapTile =>
  ({ q: 0, r: 0, terrain, height: 0.5, settlement: null, building: null, unit: null, ownedBy: null, claimedByVillage: null }) as MapTile;

describe('tileElevation', () => {
  it('keeps water flat and lifts ice a little above it, below land steps', () => {
    expect(tileElevation(tile(TileType.Water), 40)).toBe(0);
    expect(tileElevation(tile(TileType.Ice), 40)).toBe(4);
    expect(tileElevation(tile(TileType.Ice), 80)).toBe(8);
  });
});
