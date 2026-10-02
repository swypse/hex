import { axialKey, hexDistance } from './hex';
import type { GameMap, MapTile } from './map-gen';
import type { Player } from './players';
import type { Resources, Stock } from './resources';
import { roadNetworkComponents } from './roads';
import { tileAt } from './selection';
import { tileMapByKey } from './map-gen';

export type { Stock } from './resources';

const KEYS: (keyof Stock)[] = ['wood', 'stone', 'ore', 'food'];

export function emptyStock(): Stock {
  return { wood: 0, stone: 0, ore: 0, food: 0 };
}

/** The village's own stock (created empty on first use). */
export function stockOf(village: MapTile): Stock {
  const s = village.settlement!;
  return (s.stock ??= emptyStock());
}

/** The village's own stock without creating it. */
export function readStock(village: MapTile): Stock {
  return village.settlement?.stock ?? emptyStock();
}

/** Adds (or, with negative numbers, removes) materials in one village's stock. */
export function addStock(village: MapTile, delta: Partial<Stock>): void {
  const stock = stockOf(village);
  for (const k of KEYS) stock[k] += delta[k] ?? 0;
}

/** Villages first fed/used: the most developed, then by name. */
export function compareVillages(a: MapTile, b: MapTile): number {
  const byLevel = (b.settlement?.level ?? 0) - (a.settlement?.level ?? 0);
  if (byLevel !== 0) return byLevel;
  const byName = (a.settlement?.name ?? '').localeCompare(b.settlement?.name ?? '');
  return byName !== 0 ? byName : a.q - b.q || a.r - b.r;
}

/** Groups of the player's villages joined by roads or port routes. Villages in
 *  a group share their food and materials; each group is sorted most developed
 *  first. */
export function foodNetworks(map: GameMap, ownerIndex: number): MapTile[][] {
  const byKey = tileMapByKey(map);
  const networks: MapTile[][] = [];
  for (const comp of roadNetworkComponents(map, ownerIndex)) {
    const villages: MapTile[] = [];
    for (const k of comp) {
      const t = byKey.get(k);
      if (t?.settlement && t.settlement.owner === ownerIndex) villages.push(t);
    }
    if (villages.length > 0) networks.push(villages.sort(compareVillages));
  }
  return networks;
}

/** The villages sharing stock with `village` (itself included, first). */
export function villageNetwork(map: GameMap, village: MapTile): MapTile[] {
  const owner = village.settlement?.owner;
  if (owner === null || owner === undefined) return [village];
  const net = foodNetworks(map, owner).find((n) => n.includes(village));
  if (!net) return [village];
  return [village, ...net.filter((v) => v !== village)];
}

/** Everything the villages of `village`'s network hold together. */
export function networkStock(map: GameMap, village: MapTile): Stock {
  const total = emptyStock();
  for (const v of villageNetwork(map, village)) {
    const s = readStock(v);
    for (const k of KEYS) total[k] += s[k];
  }
  return total;
}

/** Everything all of the player's villages hold, connected or not. */
export function totalStock(map: GameMap, ownerIndex: number): Stock {
  const total = emptyStock();
  for (const t of map.tiles) {
    if (t.settlement?.owner !== ownerIndex) continue;
    const s = readStock(t);
    for (const k of KEYS) total[k] += s[k];
  }
  return total;
}

/** The village whose network pays for something done on `tile`: the village
 *  itself, else the one claiming the tile, else the nearest own village. Null
 *  when the player owns no village. */
export function payerVillage(map: GameMap, ownerIndex: number, tile: MapTile): MapTile | null {
  if (tile.settlement?.owner === ownerIndex) return tile;
  const c = tile.claimedByVillage;
  if (c) {
    const claim = tileAt(map, c.q, c.r);
    if (claim?.settlement?.owner === ownerIndex) return claim;
  }
  let best: MapTile | null = null;
  let bestDist = Infinity;
  for (const t of map.tiles) {
    if (t.settlement?.owner !== ownerIndex) continue;
    const d = hexDistance(t, tile);
    if (d < bestDist || (d === bestDist && best && compareVillages(t, best) < 0)) {
      best = t;
      bestDist = d;
    }
  }
  return best;
}

/** Whether `player` can pay `cost` for something done on `where`: the money
 *  from the player, the materials from the payer village's network. */
export function canAffordAt(map: GameMap, player: Player, where: MapTile, cost: Resources): boolean {
  if (player.resources.money < cost.money) return false;
  const needsStock = KEYS.some((k) => cost[k] > 0);
  if (!needsStock) return true;
  const village = payerVillage(map, player.index, where);
  if (!village) return false;
  const have = networkStock(map, village);
  return KEYS.every((k) => have[k] >= cost[k]);
}

/** Charges `cost` for something done on `where`. Materials come from the payer
 *  village first, then from the rest of its network (most developed first).
 *  Returns false, changing nothing, when it cannot be afforded. */
export function payAt(map: GameMap, player: Player, where: MapTile, cost: Resources): boolean {
  if (!canAffordAt(map, player, where, cost)) return false;
  player.resources.money -= cost.money;
  const village = payerVillage(map, player.index, where);
  if (!village) return true;
  const pool = villageNetwork(map, village);
  for (const k of KEYS) {
    let left = cost[k];
    for (const v of pool) {
      if (left <= 0) break;
      const stock = stockOf(v);
      const take = Math.min(stock[k], left);
      stock[k] -= take;
      left -= take;
    }
  }
  return true;
}

/** The village a player's pooled materials belong to when nothing else says
 *  where: the capital, else the most developed owned village. */
export function capitalOf(map: GameMap, ownerIndex: number): MapTile | null {
  let best: MapTile | null = null;
  for (const t of map.tiles) {
    if (t.settlement?.owner !== ownerIndex) continue;
    if (t.settlement.capital) return t;
    if (!best || compareVillages(t, best) < 0) best = t;
  }
  return best;
}

/** Saves from before per-village stock keep wood, stone, ore and food on the
 *  player. Moves them into the player's capital (a save without a food stock
 *  starts with the full starting food) and drops them from the player. */
export function migrateLegacyResources(map: GameMap, players: Player[]): void {
  for (const p of players) {
    const legacy: Partial<Record<keyof Stock, number>> = p.resources;
    const keys = KEYS.filter((k) => typeof legacy[k] === 'number');
    if (keys.length === 0) continue;
    const capital = capitalOf(map, p.index);
    if (capital) {
      const delta: Partial<Stock> = {};
      for (const k of keys) delta[k] = legacy[k]!;
      addStock(capital, delta);
    }
    for (const k of keys) delete legacy[k];
  }
}

/** The own village a tile belongs to: the village itself, or a tile of its
 *  territory. Null for any other tile (empty, enemy, free or unclaimed land). */
export function villageOfTile(map: GameMap, ownerIndex: number, tile: MapTile): MapTile | null {
  if (tile.settlement?.owner === ownerIndex) return tile;
  if (tile.ownedBy !== ownerIndex || !tile.claimedByVillage) return null;
  const village = tileAt(map, tile.claimedByVillage.q, tile.claimedByVillage.r);
  return village?.settlement?.owner === ownerIndex ? village : null;
}
