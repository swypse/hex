import { UnitType } from '@enums';
import { hexDistance } from '../../map/hex';
import type { MapTile } from '../../map/map-gen';
import { type Unit, movePoints } from '../../units/units';

const MELEE_TYPES = new Set<UnitType>([UnitType.WARRIOR, UnitType.RIDER, UnitType.SWORDSMAN, UnitType.SHIELD, UnitType.KNIGHT]);

export function isMelee(unit: Unit): boolean {
  return MELEE_TYPES.has(unit.type);
}

function movementOf(unit: Unit): number {
  return movePoints(unit);
}

export function turnsToOccupy(from: MapTile, to: MapTile, mover: Unit): number {
  // Flat-terrain estimate: a land tile costs 10 move points, so points/10
  // tiles per turn.
  return Math.max(1, Math.ceil((hexDistance(from, to) * 10) / movementOf(mover)));
}
