import type { UnitType } from './units';

/** Pre-rebalance snapshot captured 2026-09-24 from tests/_baseline-snapshot.json
 *  (before the archer/rider/swordsman/knight rebalance). Used by the report's
 *  before/after comparison; the "after" side is always the live UNIT_TYPES. */
export interface BaselineUnit {
  attack: number;
  defense: number;
  maxHp: number;
  price: number;
  priceWood: number;
  priceOre: number;
}

export interface BaselineStat {
  cost: number;
  efficiency: number;
  duelValue: number;
  winRate: number;
}

export interface BaselineFlag {
  cheaper: string;
  pricier: string;
  win: number;
}

export interface Baseline {
  units: Record<UnitType, BaselineUnit>;
  costs: Record<UnitType, number>;
  stats: Partial<Record<UnitType, BaselineStat>>;
  flags: BaselineFlag[];
}

export const BASELINE: Baseline = {
  units: {
    warrior: { attack: 20, defense: 10, maxHp: 50, price: 4, priceWood: 0, priceOre: 0 },
    rider: { attack: 20, defense: 7, maxHp: 40, price: 6, priceWood: 0, priceOre: 0 },
    archer: { attack: 20, defense: 7, maxHp: 40, price: 6, priceWood: 0, priceOre: 0 },
    swordsman: { attack: 40, defense: 20, maxHp: 80, price: 10, priceWood: 0, priceOre: 2 },
    shield: { attack: 7, defense: 20, maxHp: 80, price: 8, priceWood: 0, priceOre: 2 },
    catapult: { attack: 50, defense: 0, maxHp: 30, price: 15, priceWood: 10, priceOre: 3 },
    knight: { attack: 40, defense: 7, maxHp: 60, price: 14, priceWood: 0, priceOre: 5 },
    pirate: { attack: 15, defense: 5, maxHp: 80, price: 0, priceWood: 0, priceOre: 0 },
    stalker: { attack: 30, defense: 0, maxHp: 60, price: 9, priceWood: 2, priceOre: 0 },
    builder: { attack: 10, defense: 0, maxHp: 50, price: 7, priceWood: 0, priceOre: 0 },
    banner: { attack: 20, defense: 8, maxHp: 60, price: 10, priceWood: 0, priceOre: 0 },
    berserker: { attack: 50, defense: 12, maxHp: 70, price: 11, priceWood: 0, priceOre: 3 },
    trapper: { attack: 20, defense: 8, maxHp: 50, price: 9, priceWood: 2, priceOre: 0 },
    stormcaller: { attack: 20, defense: 8, maxHp: 50, price: 9, priceWood: 0, priceOre: 2 },
    stunner: { attack: 40, defense: 10, maxHp: 40, price: 7, priceWood: 0, priceOre: 0 },
  },
  costs: { warrior: 4, rider: 9, archer: 6, swordsman: 25, shield: 15, catapult: 42, knight: 35, pirate: 0, stalker: 11, builder: 7, banner: 10, berserker: 17, trapper: 11, stormcaller: 13, stunner: 7 },
  stats: {
    warrior: { cost: 4, efficiency: 3.38, duelValue: 13.5, winRate: 0.26 },
    rider: { cost: 9, efficiency: 2.74, duelValue: 24.7, winRate: 0.18 },
    archer: { cost: 6, efficiency: 1.73, duelValue: 10.4, winRate: 0.18 },
    swordsman: { cost: 25, efficiency: 2.87, duelValue: 71.8, winRate: 0.84 },
    shield: { cost: 15, efficiency: 1.28, duelValue: 19.2, winRate: 0.50 },
    catapult: { cost: 42, efficiency: 1.64, duelValue: 69.0, winRate: 0.80 },
    knight: { cost: 35, efficiency: 1.59, duelValue: 55.5, winRate: 0.74 },
  },
  flags: [
    { cheaper: 'warrior', pricier: 'rider', win: 0.9175 },
    { cheaper: 'swordsman', pricier: 'knight', win: 0.957 },
  ],
};