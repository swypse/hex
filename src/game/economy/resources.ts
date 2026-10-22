import { t } from '../../i18n';

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

/** Level at which the cubic surcharge on the upgrade price equals the linear part. */
const UPGRADE_COST_KNEE = 9;

// Cost to upgrade a village from the given level to the next one: the level-1
// price is 2 wood / 1 stone / 2 money, then k = level × (1 + (level / 9)³): close
// to linear in the first levels, doubling by level 9 and exploding after
// (level 10 ≈ 24×, level 15 ≈ 84×, level 25 ≈ 560× the base), so level 25 is out
// of reach in a normal game.
export function villageUpgradeCost(level: number): Resources {
  const k = level * (1 + (level / UPGRADE_COST_KNEE) ** 3);
  return { wood: Math.round(2 * k), stone: Math.round(k), money: Math.round(2 * k), ore: 0, food: 0 };
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

/** Rich-text tokens for the non-zero amounts of a bundle, e.g. `[money:12] [ore:1]` ('-' when empty), for the inline resource icons of rich labels. */
export function resourceTokens(amount: Resources): string {
  const parts = (['money', 'wood', 'stone', 'ore', 'food'] as const).filter((k) => amount[k] > 0).map((k) => `[${k}:${amount[k]}]`);
  return parts.length > 0 ? parts.join(' ') : '-';
}

/** A cost as short button text: `40m, 10s, 5o` (money, wood, stone, ore; zeros left out). */
export function costLabel(cost: Resources): string {
  const parts: string[] = [];
  if (cost.money > 0) parts.push(`${cost.money}${t('cost.money')}`);
  if (cost.wood > 0) parts.push(`${cost.wood}${t('cost.wood')}`);
  if (cost.stone > 0) parts.push(`${cost.stone}${t('cost.stone')}`);
  if (cost.ore > 0) parts.push(`${cost.ore}${t('cost.ore')}`);
  return parts.join(', ');
}
