import type { UnitType } from '@enums';
import { effectiveCost } from '../../balance/balance';
import { isExploredFor } from '../../map/explore';
import type { GameMap } from '../../map/map-gen';
import { canCounterAttack, resolveCombat } from '../../units/combat';
import { isShip } from '../../units/ship';
import { makeUnit, UNIT_ATTACK_DISTANCE, unitMaxHp } from '../../units/units';

/** Net edge of `type` hitting every visible garrison on an enemy village (real tile, so the
 *  village/wall defense bonus counts): hp share dealt minus hp share taken back, per unit of cost.
 *  Null when no such garrison is visible. */
export function assaultEdge(map: GameMap, playerIndex: number, types: UnitType[]): Map<UnitType, number> | null {
  const garrisons = map.tiles.filter((t) => t.settlement && t.settlement.owner !== null && t.settlement.owner !== playerIndex && t.unit && t.unit.owner === t.settlement.owner && !isShip(t.unit) && t.unit.isStealthed !== true && isExploredFor(t, playerIndex));
  if (garrisons.length === 0) return null;
  const edge = new Map<UnitType, number>();
  for (const type of types) {
    const ghost = makeUnit(playerIndex, type, 0, 0);
    const dist = UNIT_ATTACK_DISTANCE[type];
    let net = 0;
    for (const g of garrisons) {
      const target = g.unit!;
      const { attackerDamage, counterDamage } = resolveCombat(map, ghost, g);
      const dealt = Math.min(attackerDamage, target.hp) / unitMaxHp(target);
      const taken = target.hp > attackerDamage && canCounterAttack(target, dist) ? counterDamage / unitMaxHp(ghost) : 0;
      net += dealt - taken;
    }
    edge.set(type, net / garrisons.length / effectiveCost(type));
  }
  return edge;
}

/** Candidate with the best assault edge (ties keep the earlier one), or null when no garrison is visible. */
export function bestAssaultType(map: GameMap, playerIndex: number, candidates: UnitType[]): UnitType | null {
  const edge = assaultEdge(map, playerIndex, candidates);
  if (!edge) return null;
  let best = candidates[0]!;
  for (const type of candidates) if (edge.get(type)! > edge.get(best)! + 1e-9) best = type;
  return best;
}
