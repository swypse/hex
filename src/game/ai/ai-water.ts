import { axialKey, hexDistance, hexNeighbors } from '../map/hex';
import type { GameMap, MapTile } from '../map/map-gen';
import { isWaterType } from '../map/tile-types';
import { isExploredFor } from '../map/explore';
import { tileMapByKey } from '../map/tile-index';
import { BuildingKind } from '@enums';

/** A water body smaller than this is a pond: a port there leads nowhere. */
export const MIN_PORT_WATER = 6;
/** An enemy village this close (hexes) to a body's water is reachable over it. */
const ENEMY_COAST_DIST = 3;
const OCEAN_VALUE = 8;
const ENEMY_VALUE = 6;
/** Extra value of a site that is near the enemy coast (max). */
const NEAR_ENEMY_VALUE = 6;
/** A site is worth a port of its own only from this value on (ocean or enemy access). */
export const OPEN_PORT_VALUE = 6;

/** Every water body of the map (connected water tiles, any owner) and what it opens up for one player. */
export interface WaterAtlas {
  body: Map<string, number>;
  size: number[];
  /** The body touches the map edge: the open ocean around the map. */
  ocean: boolean[];
  /** Nearest distance from the body's water to an explored enemy village. */
  enemyDist: number[];
  /** Explored enemy villages. */
  enemies: MapTile[];
  /** Bodies in which the player already has a port. */
  ported: Set<number>;
}

export function analyzeWater(map: GameMap, playerIndex: number): WaterAtlas {
  const byKey = tileMapByKey(map);
  const enemies = map.tiles.filter((t) => t.settlement !== null && t.settlement.owner !== playerIndex && isExploredFor(t, playerIndex));
  const atlas: WaterAtlas = { body: new Map(), size: [], ocean: [], enemyDist: [], enemies, ported: new Set() };
  for (const start of map.tiles) {
    const sk = axialKey(start);
    if (atlas.body.has(sk) || !isWaterType(start.terrain)) continue;
    const id = atlas.size.length;
    let size = 0;
    let ocean = false;
    let enemyDist = Infinity;
    atlas.body.set(sk, id);
    const queue: MapTile[] = [start];
    while (queue.length > 0) {
      const cur = queue.pop()!;
      size++;
      const around = hexNeighbors(cur);
      if (around.some((n) => !byKey.has(axialKey(n)))) ocean = true;
      for (const e of enemies) enemyDist = Math.min(enemyDist, hexDistance(cur, e));
      if (cur.building?.kind === BuildingKind.PORT && cur.ownedBy === playerIndex) atlas.ported.add(id);
      for (const n of around) {
        const t = byKey.get(axialKey(n));
        if (t && isWaterType(t.terrain) && !atlas.body.has(axialKey(t))) {
          atlas.body.set(axialKey(t), id);
          queue.push(t);
        }
      }
    }
    atlas.size.push(size);
    atlas.ocean.push(ocean);
    atlas.enemyDist.push(enemyDist);
  }
  return atlas;
}

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

/** The best site for a port that is worth building for its own sake: opens the ocean or a
 *  way to enemy villages, in a body where the player has no port yet. */
export function bestOpenPortSite(atlas: WaterAtlas, sites: MapTile[]): MapTile | null {
  let best: MapTile | null = null;
  let bestValue = OPEN_PORT_VALUE - 1;
  for (const s of sites) {
    const id = atlas.body.get(axialKey(s));
    if (id === undefined || atlas.ported.has(id)) continue;
    const v = portSiteValue(atlas, s);
    if (v > bestValue) {
      best = s;
      bestValue = v;
    }
  }
  return best;
}
