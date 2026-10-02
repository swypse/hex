export interface Resources {
  wood: number;
  stone: number;
  money: number;
  ore: number;
  food: number;
}

export const START_RESOURCES: Resources = { wood: 3, stone: 2, money: 8, ore: 0, food: 25 };

/** What one village holds: the materials of `Resources`. Money is the player's
 *  own; wood, stone, ore and food live in villages and are pooled by each
 *  road/port network of connected villages. */
export type Stock = Omit<Resources, 'money'>;

/** What a player's capital holds at the start of the game. */
export const START_STOCK: Stock = {
  wood: START_RESOURCES.wood,
  stone: START_RESOURCES.stone,
  ore: START_RESOURCES.ore,
  food: START_RESOURCES.food,
};

/** What a player owns outright: money. Saves from before per-village stock
 *  also carry wood, stone, ore and food here; they are moved into the capital
 *  when the game is loaded (see `migrateLegacyResources`) and never read
 *  afterwards. */
export interface PlayerResources {
  money: number;
  /** @deprecated legacy saves only: the player's materials now live in villages. */
  wood?: number;
  /** @deprecated see `wood`. */
  stone?: number;
  /** @deprecated see `wood`. */
  ore?: number;
  /** @deprecated see `wood`. */
  food?: number;
}

export const UPGRADE_COST: Resources = { wood: 2, stone: 1, money: 2, ore: 0, food: 0 };

// Cost to upgrade a village from the given level to the next one.
export function villageUpgradeCost(level: number): Resources {
  return { wood: 2 * level, stone: level, money: 2 * level, ore: 0, food: 0 };
}

/** Money-only cost, the common case for maintaining reserve checks. */
export function moneyCost(money: number): Resources {
  return { wood: 0, stone: 0, money, ore: 0, food: 0 };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return (
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.money >= cost.money &&
    have.ore >= cost.ore &&
    have.food >= cost.food
  );
}

export function pay(have: Resources, cost: Resources): Resources {
  return {
    wood: have.wood - cost.wood,
    stone: have.stone - cost.stone,
    money: have.money - cost.money,
    ore: have.ore - cost.ore,
    food: have.food - cost.food,
  };
}
