import { BuildingKind } from '@enums';
import { isExploredFor } from '../../map/explore';
import { axialKey, hexDistance, hexNeighbors } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import { tileMapByKey } from '../../map/tile-index';
import { isWaterType } from '../../map/tile-types';

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
