import { BuildingKind } from '@enums';
import type { GameMap } from '../map/map-gen';
import { isWaterType } from '../map/tile-types';

/** Numeric hash of everything the road, port and water networks depend on:
 *  village owners, road owners, ports, water terrain and its ownership. Units
 *  and the rest of the tile state are ignored, so network results can be
 *  reused across the many queries (and re-renders) between real changes. */
export function networkStateFingerprint(map: GameMap): number {
  let h = map.tiles.length;
  for (const t of map.tiles) {
    const village = t.settlement !== null ? t.settlement.owner ?? -1 : -2;
    const road = t.roadOwner ?? -1;
    const port = t.building?.kind === BuildingKind.PORT ? 1 : 0;
    const water = isWaterType(t.terrain) ? 1 : 0;
    if (village === -2 && road === -1 && !port && !water) continue;
    h = (Math.imul(h, 31) + village + 3 + ((road + 2) << 4) + (port << 8) + (water << 9) + (((t.ownedBy ?? -1) + 2) << 10)) | 0;
    h = (Math.imul(h, 31) + t.q * 1009 + t.r) | 0;
  }
  return h;
}

/** Read-only planning window: while `trackedMap` is set (and not suspended), the
 *  map's network state is assumed unchanged as long as `epoch` is, so a memo
 *  hit costs nothing instead of a fingerprint pass. Whoever mutates the map
 *  inside the window must suspend tracking (`untrackedNetworks`) and bump the
 *  epoch afterwards. Outside the window every memo hit is fingerprint-checked. */
let trackedMap: GameMap | null = null;
let epoch = 0;
let suspended = 0;

export function trackNetworkEpoch(map: GameMap | null): void {
  trackedMap = map;
  epoch++;
}

export function bumpNetworkEpoch(): void {
  epoch++;
}

/** Runs `fn` (which may mutate the map) with epoch trust off; bumps the epoch after. */
export function untrackedNetworks<T>(fn: () => T): T {
  suspended++;
  try {
    return fn();
  } finally {
    suspended--;
    epoch++;
  }
}

/** Memo slot for derived network data of one map, valid while the state holds. */
export class NetworkMemo<T> {
  private readonly slots = new WeakMap<GameMap, { fingerprint: number; epoch: number; value: T }>();

  get(map: GameMap, compute: () => T): T {
    const slot = this.slots.get(map);
    const trusted = trackedMap === map && suspended === 0;
    if (slot && trusted && slot.epoch === epoch) return slot.value;
    const fingerprint = networkStateFingerprint(map);
    const stamp = trusted ? epoch : -1;
    if (slot && slot.fingerprint === fingerprint) {
      slot.epoch = stamp;
      return slot.value;
    }
    const value = compute();
    this.slots.set(map, { fingerprint, epoch: stamp, value });
    return value;
  }
}
