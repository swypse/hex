export interface Resources {
  wood: number;
  stone: number;
  money: number;
  ore: number;
}

export const START_RESOURCES: Resources = { wood: 3, stone: 2, money: 5, ore: 0 };

export const UPGRADE_COST: Resources = { wood: 2, stone: 1, money: 2, ore: 0 };

// Cost to upgrade a village from the given level to the next one.
export function villageUpgradeCost(level: number): Resources {
  return { wood: 2 * level, stone: level, money: 2 * level, ore: 0 };
}

export function canAfford(have: Resources, cost: Resources): boolean {
  return (
    have.wood >= cost.wood &&
    have.stone >= cost.stone &&
    have.money >= cost.money &&
    have.ore >= cost.ore
  );
}

export function pay(have: Resources, cost: Resources): Resources {
  return {
    wood: have.wood - cost.wood,
    stone: have.stone - cost.stone,
    money: have.money - cost.money,
    ore: have.ore - cost.ore,
  };
}
