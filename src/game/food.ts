import { hexNeighbors } from './hex';
import { BUILDING_COSTS, buildingIncome } from './buildings';
import type { GameMap, MapTile } from './map-gen';
import type { Player } from './players';
import { hasSkill } from './skills';
import { unitFoodUpkeep, type UnitType } from './units';
import { villageEnemyOccupied } from './capture';

/** Food a farm yields at the end of each round. */
export const FARM_FOOD = 3;
/** Farm yield once its owner has opened Science. */
export const FARM_FOOD_SCIENCE = 4;
/** Food a granary gains per adjacent own farm at the end of each round. */
export const GRANARY_FOOD_PER_FARM = 1;
/** Hp every unit of a starving village loses per round. */
export const STARVATION_DAMAGE = 5;

export function farmYield(owner: Player | null | undefined): number {
  return owner && hasSkill(owner, 'science') ? FARM_FOOD_SCIENCE : FARM_FOOD;
}

function villageOf(map: GameMap, tile: MapTile): MapTile | undefined {
  const c = tile.claimedByVillage;
  if (!c) return undefined;
  return map.tiles.find((t) => t.q === c.q && t.r === c.r && t.settlement);
}

/** Whether a farm/granary on `tile` is working: it belongs to `ownerIndex` and
 *  its village is not occupied by an enemy unit. */
function productive(map: GameMap, tile: MapTile, ownerIndex: number): boolean {
  if (tile.ownedBy !== ownerIndex) return false;
  const village = villageOf(map, tile);
  return !(village && villageEnemyOccupied(village));
}

/** Food the units raised by this village eat per round. */
export function villageFoodUpkeep(map: GameMap, villageTile: MapTile): number {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return 0;
  let upkeep = 0;
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== owner) continue;
    const sv = unit.spawnVillage;
    if (sv && sv.q === villageTile.q && sv.r === villageTile.r) upkeep += unitFoodUpkeep(unit.type);
  }
  return upkeep;
}

/** Food produced per round by the farms on this village's territory. */
export function villageFoodProduction(map: GameMap, villageTile: MapTile, owner: Player | null | undefined): number {
  const ownerIndex = villageTile.settlement?.owner;
  if (ownerIndex === null || ownerIndex === undefined) return 0;
  let farms = 0;
  for (const t of map.tiles) {
    if (t.building?.kind !== 'farm') continue;
    const c = t.claimedByVillage;
    if (!c || c.q !== villageTile.q || c.r !== villageTile.r) continue;
    if (productive(map, t, ownerIndex)) farms += 1;
  }
  return farms * farmYield(owner);
}

/** Granary tiles on this village's territory. */
export function villageGranaries(map: GameMap, villageTile: MapTile): MapTile[] {
  const ownerIndex = villageTile.settlement?.owner;
  return map.tiles.filter((t) => {
    if (t.building?.kind !== 'granary' || t.ownedBy !== ownerIndex) return false;
    const c = t.claimedByVillage;
    return !!c && c.q === villageTile.q && c.r === villageTile.r;
  });
}

/** Total food stored in this village's granaries. */
export function villageGranaryFood(map: GameMap, villageTile: MapTile): number {
  return villageGranaries(map, villageTile).reduce((sum, t) => sum + (t.building?.food ?? 0), 0);
}

/** Own farms adjacent to `tile`. */
export function adjacentFarmCount(map: GameMap, tile: MapTile, ownerIndex: number): number {
  let n = 0;
  for (const nb of hexNeighbors(tile)) {
    const t = map.tiles.find((x) => x.q === nb.q && x.r === nb.r);
    if (t?.building?.kind === 'farm' && t.ownedBy === ownerIndex) n += 1;
  }
  return n;
}

export interface VillageFood {
  production: number;
  upkeep: number;
  /** production − upkeep for one round. */
  balance: number;
  granaryFood: number;
  starving: boolean;
}

/** Food figures of one owned village (`starving` is the state set at the last
 *  round end). */
export function villageFood(map: GameMap, villageTile: MapTile, owner: Player | null | undefined): VillageFood {
  const production = villageFoodProduction(map, villageTile, owner);
  const upkeep = villageFoodUpkeep(map, villageTile);
  return {
    production,
    upkeep,
    balance: production - upkeep,
    granaryFood: villageGranaryFood(map, villageTile),
    starving: villageTile.settlement?.starving === true,
  };
}

/** Farms on the player's tiles that belong to no village (synthetic maps). */
function unclaimedFarmProduction(map: GameMap, player: Player): number {
  let n = 0;
  for (const t of map.tiles) {
    if (t.building?.kind === 'farm' && t.ownedBy === player.index && !villageOf(map, t)) n += 1;
  }
  return n * farmYield(player);
}

/** Net food change per round for the player: farm production minus the food
 *  upkeep of all units raised by their villages (what the HUD shows as +N). */
export function foodNetIncome(map: GameMap, player: Player): number {
  let net = unclaimedFarmProduction(map, player);
  for (const t of map.tiles) {
    if (!t.settlement || t.settlement.owner !== player.index) continue;
    net += villageFood(map, t, player).balance;
  }
  return net;
}

export interface StarvationReport {
  /** The village that could not feed its units. */
  village: MapTile;
  /** Units that lost hp and how much. */
  units: { q: number; r: number; damage: number }[];
}

/** Round-end food step for one player: granaries grow, farms feed the shared
 *  stock, then each village eats. A village short of food draws on the stock,
 *  then on its own granaries; if that still is not enough it starves and every
 *  unit it raised loses STARVATION_DAMAGE hp (never below 1). */
export function applyFood(map: GameMap, player: Player): StarvationReport[] {
  const villages = map.tiles.filter((t) => t.settlement && t.settlement.owner === player.index);

  for (const t of map.tiles) {
    if (t.building?.kind !== 'granary' || !productive(map, t, player.index)) continue;
    t.building.food = (t.building.food ?? 0) + GRANARY_FOOD_PER_FARM * adjacentFarmCount(map, t, player.index);
  }

  let stock = player.resources.food + unclaimedFarmProduction(map, player);
  const deficits: { village: MapTile; need: number }[] = [];
  for (const v of villages) {
    const f = villageFood(map, v, player);
    if (f.balance >= 0) stock += f.balance;
    else deficits.push({ village: v, need: -f.balance });
  }

  const reports: StarvationReport[] = [];
  deficits.sort((a, b) => a.need - b.need);
  for (const { village, need } of deficits) {
    let left = need;
    const fromStock = Math.min(stock, left);
    stock -= fromStock;
    left -= fromStock;
    for (const g of villageGranaries(map, village)) {
      if (left <= 0) break;
      const take = Math.min(g.building!.food ?? 0, left);
      g.building!.food = (g.building!.food ?? 0) - take;
      left -= take;
    }
    if (left > 0) reports.push({ village, units: [] });
  }

  for (const v of villages) v.settlement!.starving = false;
  for (const report of reports) {
    const v = report.village;
    v.settlement!.starving = true;
    for (const t of map.tiles) {
      const u = t.unit;
      if (!u || u.owner !== player.index) continue;
      const sv = u.spawnVillage;
      if (!sv || sv.q !== v.q || sv.r !== v.r || unitFoodUpkeep(u.type) === 0) continue;
      const damage = Math.min(STARVATION_DAMAGE, Math.max(0, u.hp - 1));
      u.hp -= damage;
      report.units.push({ q: t.q, r: t.r, damage });
    }
  }
  player.resources.food = stock;
  return reports;
}

/** How worried the AI should be about food: `urgent` when the stock runs out
 *  within three turns at the current rate, `low` when the balance is negative
 *  or the stock is thin, otherwise `none`. */
export function foodPressure(map: GameMap, player: Player): 'none' | 'low' | 'urgent' {
  const net = foodNetIncome(map, player);
  const stock = player.resources.food;
  if (net < 0 && stock + net * 3 < 0) return 'urgent';
  if (net < 0 || stock < 8) return 'low';
  return 'none';
}

/** Whether feeding one more unit of `type` keeps the stock positive for the
 *  next `horizon` turns at the current rate. */
export function canSustainUnit(map: GameMap, player: Player, type: UnitType, horizon = 6): boolean {
  const net = foodNetIncome(map, player) - unitFoodUpkeep(type);
  return net >= 0 || player.resources.food + net * horizon >= 0;
}

/** Whether spending `cost` (wood/stone part) would dig into the materials of
 *  the next farm while the player still needs one: food is under pressure, or
 *  there is no farm and no stone income yet. */
export function eatsFarmMaterials(map: GameMap, player: Player, cost: { wood: number; stone: number }): boolean {
  if (cost.wood <= 0 && cost.stone <= 0) return false;
  const noFarmYet = !map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === 'farm');
  const needFarm = foodPressure(map, player) !== 'none' || (noFarmYet && buildingIncome(map, player).stone === 0);
  if (!needFarm) return false;
  const farm = BUILDING_COSTS.farm;
  return (
    (cost.wood > 0 && player.resources.wood - cost.wood < farm.wood) ||
    (cost.stone > 0 && player.resources.stone - cost.stone < farm.stone)
  );
}
