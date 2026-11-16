import type { Resources } from './resources';

/** Share of the price the Villagers builder saves on everything it builds. */
export const BUILDER_DISCOUNT = 0.2;

/** `cost` with the builder discount applied to every resource. */
export function builderPrice(cost: Resources): Resources {
  const cut = (n: number): number => Math.round(n * (1 - BUILDER_DISCOUNT));
  return { wood: cut(cost.wood), stone: cut(cost.stone), money: cut(cost.money), ore: cut(cost.ore), food: cut(cost.food) };
}
