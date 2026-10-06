import { axialKey, hexNeighbors } from '../map/hex';
import { BUILDING_COSTS, buildingIncome } from './buildings';
import { type GameMap, type MapTile } from '../map/map-gen';
import type { Player } from '../players';
import { foodNetworks, networkStock, readStock, stockOf, totalStock } from './stock';
import { hasSkill } from '../skills';
import { unitFoodUpkeep, type Unit } from '../units/units';
import { BuildingKind, FoodPressure, Season, SkillId, UnitType } from '@enums';
import { SEASON_LENGTH } from '../season';
import { droughtOverTile, halvedYield } from '../weather/weather';
import { tileMapByKey } from '../map/tile-index';


/** Food a farm yields at the end of each round. */
export const FARM_FOOD = 2;
/** Farm yield once its owner has opened Science. */
export const FARM_FOOD_SCIENCE = 3;
/** Most food one granary can hold. */
export const GRANARY_CAPACITY = 50;
/** Hp a unit loses when it gets none of the food it needs; a partly fed unit
 *  loses the missing share of it (rounded). */
export const STARVATION_DAMAGE = 10;

/** Order in which equally hungry units are fed (the hungriest go first). */
const UNIT_FEED_PRIORITY: UnitType[] = [
  UnitType.KNIGHT, UnitType.CATAPULT, UnitType.SWORDSMAN, UnitType.STORMCALLER, UnitType.BERSERKER, UnitType.TRAPPER, UnitType.STUNNER, UnitType.STALKER, UnitType.BUILDER, UnitType.BANNER,
  UnitType.SHIELD, UnitType.RIDER, UnitType.ARCHER, UnitType.WARRIOR, UnitType.PIRATE,
];

/** Farm yield per round: nothing in winter, otherwise 2 (3 with Science), halved
 *  (rounded up) for a farm inside a drought. */
export function farmYield(owner: Player | null | undefined, map?: Pick<GameMap, 'season' | 'weather'>, farm?: MapTile): number {
  if (map?.season === Season.WINTER) return 0;
  const normal = owner && hasSkill(owner, SkillId.SCIENCE) ? FARM_FOOD_SCIENCE : FARM_FOOD;
  // A drought halves the farms inside it.
  return farm && map && droughtOverTile(map, farm) ? halvedYield(normal) : normal;
}

/** Units are fed from the hungriest to the least hungry. */
function compareUnits(a: Unit, b: Unit): number {
  const byFood = unitFoodUpkeep(b.type) - unitFoodUpkeep(a.type);
  return byFood !== 0 ? byFood : UNIT_FEED_PRIORITY.indexOf(a.type) - UNIT_FEED_PRIORITY.indexOf(b.type);
}

function claimedBy(tile: MapTile, villageKeys: Set<string>): boolean {
  const c = tile.claimedByVillage;
  return !!c && villageKeys.has(axialKey(c));
}

function keysOf(villages: MapTile[]): Set<string> {
  return new Set(villages.map((v) => axialKey(v)));
}

/** Farms of the player standing on the territory of these villages. */
function farmsOf(map: GameMap, ownerIndex: number, villageKeys: Set<string>): MapTile[] {
  return map.tiles.filter((t) => t.building?.kind === BuildingKind.FARM && t.ownedBy === ownerIndex && claimedBy(t, villageKeys));
}

/** Granaries of the player standing on the territory of these villages. */
function granariesOf(map: GameMap, ownerIndex: number, villageKeys: Set<string>): MapTile[] {
  return map.tiles.filter((t) => t.building?.kind === BuildingKind.GRANARY && t.ownedBy === ownerIndex && claimedBy(t, villageKeys));
}

/** Units raised by these villages that eat food, in feeding order: village by
 *  village (as given), hungriest unit first. */
function eatersOf(map: GameMap, ownerIndex: number, villages: MapTile[]): { unit: Unit; tile: MapTile; village: MapTile }[] {
  const out: { unit: Unit; tile: MapTile; village: MapTile }[] = [];
  const byVillage = new Map<string, { unit: Unit; tile: MapTile }[]>();
  for (const t of map.tiles) {
    const u = t.unit;
    if (!u || u.owner !== ownerIndex || !u.spawnVillage || unitFoodUpkeep(u.type) === 0) continue;
    const k = axialKey(u.spawnVillage);
    const list = byVillage.get(k) ?? [];
    list.push({ unit: u, tile: t });
    byVillage.set(k, list);
  }
  for (const village of villages) {
    const list = byVillage.get(axialKey(village)) ?? [];
    list.sort((a, b) => compareUnits(a.unit, b.unit));
    for (const e of list) out.push({ ...e, village });
  }
  return out;
}

function networkOfVillage(map: GameMap, villageTile: MapTile): MapTile[] {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return [villageTile];
  return foodNetworks(map, owner).find((n) => n.includes(villageTile)) ?? [villageTile];
}

/** Granary tiles that serve this village: those on the territory of any village
 *  in its network. */
export function villageGranaries(map: GameMap, villageTile: MapTile): MapTile[] {
  const owner = villageTile.settlement?.owner;
  if (owner === null || owner === undefined) return [];
  return granariesOf(map, owner, keysOf(networkOfVillage(map, villageTile)));
}

/** Own farms adjacent to `tile`. */
export function adjacentFarmCount(map: GameMap, tile: MapTile, ownerIndex: number): number {
  const byKey = tileMapByKey(map);
  let n = 0;
  for (const nb of hexNeighbors(tile)) {
    const t = byKey.get(axialKey(nb));
    if (t?.building?.kind === BuildingKind.FARM && t.ownedBy === ownerIndex) n += 1;
  }
  return n;
}

export interface VillageFood {
  /** Food per round from the farms of the village's whole network. */
  production: number;
  /** Food per round eaten by the units of the whole network. */
  upkeep: number;
  /** production − upkeep for one round. */
  balance: number;
  /** Food stored in the network's granaries. */
  granaryFood: number;
  /** Villages sharing this food (1 when not connected to another). */
  networkSize: number;
  starving: boolean;
}

function networkFood(map: GameMap, ownerIndex: number, villages: MapTile[], owner: Player | null | undefined): Omit<VillageFood, 'starving'> {
  const keys = keysOf(villages);
  const production = farmsOf(map, ownerIndex, keys).reduce((sum, farm) => sum + farmYield(owner, map, farm), 0);
  const upkeep = eatersOf(map, ownerIndex, villages).reduce((sum, e) => sum + unitFoodUpkeep(e.unit.type), 0);
  const granaryFood = granariesOf(map, ownerIndex, keys).reduce((sum, t) => sum + (t.building?.food ?? 0), 0);
  return { production, upkeep, balance: production - upkeep, granaryFood, networkSize: villages.length };
}

/** Food figures of one owned village: they describe its whole food network
 *  (`starving` is this village's own state). */
export function villageFood(map: GameMap, villageTile: MapTile, owner: Player | null | undefined): VillageFood {
  const ownerIndex = villageTile.settlement?.owner;
  const base =
    ownerIndex === null || ownerIndex === undefined
      ? { production: 0, upkeep: 0, balance: 0, granaryFood: 0, networkSize: 1 }
      : networkFood(map, ownerIndex, networkOfVillage(map, villageTile), owner);
  return { ...base, starving: villageTile.settlement?.starving === true };
}

export interface StarvationReport {
  /** The village whose unit could not be fed. */
  village: MapTile;
  /** Units that lost hp and how much. */
  units: { q: number; r: number; damage: number }[];
}

/** Food the player can draw on besides farms: the food held by its villages
 *  plus everything stored in own granaries. */
function playerFoodStock(map: GameMap, player: Player): number {
  let stock = totalStock(map, player.index).food;
  for (const t of map.tiles) {
    if (t.building?.kind === BuildingKind.GRANARY && t.ownedBy === player.index) stock += t.building.food ?? 0;
  }
  return stock;
}

/** Net food change per round for the player: farm production minus the food
 *  upkeep of all units raised by their villages. Surplus is not banked unless
 *  granaries stand next to the farms; it is an AI planning figure. */
export function foodNetIncome(map: GameMap, player: Player): number {
  let net = 0;
  for (const villages of foodNetworks(map, player.index)) {
    net += networkFood(map, player.index, villages, player).balance;
  }
  return net;
}

/** Round-end food step for one player. Villages joined by roads or port routes
 *  share their food. In each such network the units are fed village by village
 *  (most developed first) and unit by unit (hungriest first) from the farms,
 *  farms away from granaries first. Food left on a farm next to a granary is
 *  stored there (up to GRANARY_CAPACITY, the rest is lost). A unit still short
 *  of food is fed from the network's granaries, then the starting reserve, then
 *  other granaries. A unit that stays short loses the missing share of
 *  STARVATION_DAMAGE hp (never below 1) and its village is starving. With
 *  `dryRun` only the villages' `starving` flags change. */
export function applyFood(map: GameMap, player: Player, dryRun = false): StarvationReport[] {
  const owner = player.index;
  const byKey = tileMapByKey(map);
  const granaries = map.tiles.filter((t) => t.building?.kind === BuildingKind.GRANARY && t.ownedBy === owner);
  const granarySet = new Set(granaries);
  // Working copies, so a dry run leaves granaries, reserve and units untouched.
  const amounts = new Map<MapTile, number>(granaries.map((g) => [g, g.building!.food ?? 0]));
  // Food held by the villages themselves: a working copy per village.
  const reserves = new Map<MapTile, number>();
  for (const t of map.tiles) if (t.settlement?.owner === owner) reserves.set(t, readStock(t).food);
  const stored = (g: MapTile): number => amounts.get(g) ?? 0;

  const adjacentGranaries = (farm: MapTile): MapTile[] => {
    const out: MapTile[] = [];
    for (const nb of hexNeighbors(farm)) {
      const g = byKey.get(axialKey(nb));
      if (g && granarySet.has(g)) out.push(g);
    }
    return out;
  };

  const drain = (list: MapTile[], amount: number): number => {
    let got = 0;
    for (const gr of [...list].sort((a, b) => stored(b) - stored(a))) {
      if (got >= amount) break;
      const take = Math.min(stored(gr), amount - got);
      amounts.set(gr, stored(gr) - take);
      got += take;
    }
    return got;
  };

  interface Eater { unit: Unit; tile: MapTile; village: MapTile; need: number; got: number }
  interface Net { villages: MapTile[]; eaters: Eater[]; keys: Set<string> }
  const nets: Net[] = foodNetworks(map, owner).map((villages) => ({
    villages,
    keys: keysOf(villages),
    eaters: eatersOf(map, owner, villages).map((e) => ({ ...e, need: unitFoodUpkeep(e.unit.type), got: 0 })),
  }));

  // Stage 1: the farms feed their network; leftovers of farms next to a granary are stored.
  const covered = new Set<string>();
  const feedFromFarms = (farms: MapTile[], eaters: Eater[]): void => {
    const plain = farms.filter((f) => adjacentGranaries(f).length === 0);
    const near = farms.filter((f) => adjacentGranaries(f).length > 0);
    const pool = [...plain, ...near].map((farm) => ({ farm, left: farmYield(player, map, farm) }));
    for (const e of eaters) {
      for (const slot of pool) {
        if (e.got >= e.need) break;
        const take = Math.min(slot.left, e.need - e.got);
        slot.left -= take;
        e.got += take;
      }
    }
    for (const { farm, left: rest } of pool) {
      let left = rest;
      // Leftover goes to the emptiest adjacent granary that still has room.
      while (left > 0) {
        const open = adjacentGranaries(farm).filter((gr) => stored(gr) < GRANARY_CAPACITY);
        if (open.length === 0) break;
        open.sort((a, b) => stored(a) - stored(b));
        const gr = open[0]!;
        const add = Math.min(left, GRANARY_CAPACITY - stored(gr));
        amounts.set(gr, stored(gr) + add);
        left -= add;
      }
    }
  };
  for (const net of nets) {
    const farms = farmsOf(map, owner, net.keys);
    for (const f of farms) covered.add(axialKey(f));
    feedFromFarms(farms, net.eaters);
  }
  // Farms that belong to no network feed nobody but still fill adjacent granaries.
  feedFromFarms(map.tiles.filter((t) => t.building?.kind === BuildingKind.FARM && t.ownedBy === owner && !covered.has(axialKey(t))), []);

  // Stage 2: units still hungry eat from the network's granaries, then from the
  // food its villages hold, smallest shortage first. Nothing crosses networks.
  const drainReserve = (villages: MapTile[], amount: number): number => {
    let got = 0;
    for (const v of villages) {
      if (got >= amount) break;
      const have = reserves.get(v) ?? 0;
      const take = Math.min(have, amount - got);
      reserves.set(v, have - take);
      got += take;
    }
    return got;
  };
  const unmet = (n: Net): number => n.eaters.reduce((sum, e) => sum + (e.need - e.got), 0);
  for (const net of [...nets].filter((n) => unmet(n) > 0).sort((a, b) => unmet(a) - unmet(b))) {
    const own = granariesOf(map, owner, net.keys);
    for (const e of net.eaters) {
      const want = e.need - e.got;
      if (want <= 0) continue;
      const fromGranaries = drain(own, want);
      e.got += fromGranaries + drainReserve(net.villages, want - fromGranaries);
    }
  }

  const reports = new Map<MapTile, StarvationReport>();
  for (const t of map.tiles) {
    if (t.settlement && t.settlement.owner === owner) t.settlement.starving = false;
    if (t.unit && t.unit.owner === owner && t.unit.starving) t.unit.starving = false;
  }
  for (const net of nets) {
    for (const e of net.eaters) {
      if (e.got >= e.need) continue;
      e.village.settlement!.starving = true;
      e.unit.starving = true;
      let report = reports.get(e.village);
      if (!report) reports.set(e.village, (report = { village: e.village, units: [] }));
      if (dryRun) continue;
      const wanted = Math.round((STARVATION_DAMAGE * (e.need - e.got)) / e.need);
      const damage = Math.min(wanted, Math.max(0, e.unit.hp - 1));
      e.unit.hp -= damage;
      report.units.push({ q: e.tile.q, r: e.tile.r, damage });
    }
  }
  if (!dryRun) {
    for (const [g, n] of amounts) g.building!.food = n;
    for (const [v, n] of reserves) stockOf(v).food = n;
  }
  return [...reports.values()];
}

/** Re-evaluates which of the player's villages would starve at the coming round
 *  end (after farms, units, roads or villages changed) and updates their
 *  `starving` flag without feeding anyone. */
export function refreshStarving(map: GameMap, player: Player): void {
  applyFood(map, player, true);
}



/** Food situation of one network of connected villages (AI planning). */
export interface FoodNetworkState {
  villages: MapTile[];
  /** Tile keys of the villages, to match claimed tiles to the network. */
  keys: Set<string>;
  production: number;
  upkeep: number;
  balance: number;
  /** Granary food of the network plus the food its villages hold. */
  stock: number;
  /** Granaries standing on the network's territory. */
  granaries: number;
  pressure: FoodPressure;
}

/** Whether the network would run dry in winter: it eats, has no granary and its
 *  stock does not comfortably cover a winter of upkeep (farms yield nothing then, and only
 *  a granary keeps summer food). Moot in winter itself: it is too late. */
export function needsWinterStorage(map: Pick<GameMap, 'season'>, net: FoodNetworkState): boolean {
  return map.season !== Season.WINTER && net.upkeep > 0 && net.granaries === 0 && net.stock < net.upkeep * SEASON_LENGTH * 3;
}

/** `urgent` when the stock runs out within three turns at the current rate,
 *  `low` when the balance is negative or the stock is thin and the farms barely
 *  cover the upkeep, otherwise `none`. */
function pressureOf(balance: number, stock: number): FoodPressure {
  if (balance < 0 && stock + balance * 3 < 0) return FoodPressure.URGENT;
  if (balance < 0 || (stock < 8 && balance < 2)) return FoodPressure.LOW;
  return FoodPressure.NONE;
}

/** The food state of each of the player's networks. */
export function foodNetworkStates(map: GameMap, player: Player): FoodNetworkState[] {
  const nets = foodNetworks(map, player.index).map((villages) => ({
    villages,
    keys: keysOf(villages),
    ...networkFood(map, player.index, villages, player),
  }));
  return nets.map((n) => {
    const stock = n.granaryFood + n.villages.reduce((sum, v) => sum + readStock(v).food, 0);
    return {
      villages: n.villages,
      keys: n.keys,
      production: n.production,
      upkeep: n.upkeep,
      balance: n.balance,
      stock,
      granaries: granariesOf(map, player.index, n.keys).length,
      pressure: pressureOf(n.balance, stock),
    };
  });
}

/** The network a tile's village belongs to (undefined for unclaimed land). */
export function networkStateOfTile(states: FoodNetworkState[], tile: MapTile): FoodNetworkState | undefined {
  const c = tile.claimedByVillage;
  return c ? states.find((n) => n.keys.has(axialKey(c))) : undefined;
}

const PRESSURE_RANK: Record<FoodPressure, number> = { none: 0, low: 1, urgent: 2 };

/** How worried the AI should be about food: that of `village`'s network, or
 *  the worst of all networks when no village is given. */
export function foodPressure(map: GameMap, player: Player, village?: MapTile): FoodPressure {
  const states = foodNetworkStates(map, player);
  if (village) {
    const own = states.find((n) => n.keys.has(axialKey(village)));
    if (own) return own.pressure;
  }
  return states.reduce<FoodPressure>((worst, n) => (PRESSURE_RANK[n.pressure] > PRESSURE_RANK[worst] ? n.pressure : worst), FoodPressure.NONE);
}

/** Whether feeding one more unit of `type` raised by `village` keeps its
 *  network's stock positive for the next `horizon` turns at the current rate
 *  (the whole player when no village is given). */
export function canSustainUnit(map: GameMap, player: Player, type: UnitType, horizon = 6, village?: MapTile): boolean {
  const states = foodNetworkStates(map, player);
  const own = village ? states.find((n) => n.keys.has(axialKey(village))) : undefined;
  const balance = (own ? own.balance : foodNetIncome(map, player)) - unitFoodUpkeep(type);
  const stock = own ? own.stock : playerFoodStock(map, player);
  return balance >= 0 || stock + balance * horizon >= 0;
}

/** Whether spending `cost` (wood/stone part) would dig into the materials of
 *  the next farm while the player still needs one: food is under pressure, or
 *  there is no farm and no stone income yet. */
export function eatsFarmMaterials(map: GameMap, player: Player, cost: { wood: number; stone: number }, village?: MapTile): boolean {
  if (cost.wood <= 0 && cost.stone <= 0) return false;
  const noFarmYet = !map.tiles.some((t) => t.ownedBy === player.index && t.building?.kind === BuildingKind.FARM);
  const needFarm = foodPressure(map, player) !== FoodPressure.NONE || (noFarmYet && buildingIncome(map, player).stone === 0);
  if (!needFarm) return false;
  const farm = BUILDING_COSTS.farm;
  const have = village ? networkStock(map, village) : totalStock(map, player.index);
  return (
    (cost.wood > 0 && have.wood - cost.wood < farm.wood) ||
    (cost.stone > 0 && have.stone - cost.stone < farm.stone)
  );
}
