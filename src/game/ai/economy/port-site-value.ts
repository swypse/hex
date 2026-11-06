import { axialKey, hexDistance } from '../../map/hex';
import type { MapTile } from '../../map/map-gen';
import type { WaterAtlas } from './analyze-water';

/** A water body smaller than this is a pond: a port there leads nowhere. */
export const MIN_PORT_WATER = 6;

/** An enemy village this close (hexes) to a body's water is reachable over it. */
const ENEMY_COAST_DIST = 3;

const OCEAN_VALUE = 8;

const ENEMY_VALUE = 6;

/** Extra value of a site that is near the enemy coast (max). */
const NEAR_ENEMY_VALUE = 6;

/** How much a port on water tile `site` opens up: -Infinity for a pond, otherwise ocean access
 *  and a way to the enemy coast (closer to it is better). */
export function portSiteValue(atlas: WaterAtlas, site: MapTile): number {
  const id = atlas.body.get(axialKey(site));
  if (id === undefined || atlas.size[id]! < MIN_PORT_WATER) return -Infinity;
  let value = atlas.ocean[id] ? OCEAN_VALUE : 0;
  if (atlas.enemyDist[id]! <= ENEMY_COAST_DIST) {
    const near = Math.min(...atlas.enemies.map((e) => hexDistance(site, e)));
    value += ENEMY_VALUE + Math.max(0, NEAR_ENEMY_VALUE - Math.floor(near / 3));
  }
  return value;
}
