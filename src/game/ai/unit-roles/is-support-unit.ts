import { UnitType } from '@enums';
import type { Unit } from '../../units/units';

/** Non-combat special units: the Villagers builder, the Forest trapper and the
 *  Warriors banner. They never attack and the AI keeps them out of fights —
 *  they build, plant traps and buff their neighbours instead. */
export function isSupportUnit(unit: Unit): boolean {
  return unit.type === UnitType.BUILDER || unit.type === UnitType.TRAPPER || unit.type === UnitType.BANNER;
}
