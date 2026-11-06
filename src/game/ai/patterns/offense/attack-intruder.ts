import { AiActionType,GarrisonGuardKind,UnitType } from '@enums';
import { hexDistance } from '../../../map/hex';
import type { GameMap,MapTile } from '../../../map/map-gen';
import type { Player } from '../../../players';
import { attackableTargets,attackDamage,isPoorTrapperTarget } from '../../../units/combat';
import { reachableTargets } from '../../../units/selection';
import { attackersForTile } from '../../military/gang-attack';
import { guardGarrisonAttack } from '../../military/garrison-guard';
import { enemyCanReach } from '../../situation/enemy-reach';
import type { AiAction } from '../../types/action';
import type { AiPlannerState } from '../../types/planner-state';
import { isSupportUnit } from '../../unit-roles/is-support-unit';
import { key } from '../../util/tile-key';

/** Attacks (or moves in to attack) the enemy standing on `enemyInVillage` with every idle unit that can. */
export function attackIntruder(map: GameMap, player: Player, state: AiPlannerState, enemyInVillage: MapTile): AiAction[] | null {
  // A trapper in the village is shot by ranged units first; melee units
  // join only when they finish it. Ranged units able to hit it now or
  // after a move are what holds the melee ones back.
  const trapper = enemyInVillage.unit?.type === UnitType.TRAPPER;
  const rangedCanHit = trapper && attackersForTile(map, player, enemyInVillage, state).some((a) => a.unit.attackDistance > 1);
  const actions: AiAction[] = [];
  for (const t of map.tiles) {
    const unit = t.unit;
    if (!unit || unit.owner !== player.index) continue;
    if (state.acted.has(unit.id)) continue;
    // Support units never join a fight; a stalker strikes only when it can
    // kill the defender outright.
    if (isSupportUnit(unit)) continue;
    if (unit.type === UnitType.STALKER && enemyInVillage.unit && attackDamage(unit) < enemyInVillage.unit.hp) continue;
    if (rangedCanHit && enemyInVillage.unit && isPoorTrapperTarget(unit, enemyInVillage.unit)) continue;
    if (
      attackableTargets(map, unit, unit.owner).some(
        (a) => a.q === enemyInVillage.q && a.r === enemyInVillage.r,
      )
    ) {
      const garrisonGuard = guardGarrisonAttack(map, player, unit, enemyInVillage, state);
      if (garrisonGuard.kind === GarrisonGuardKind.HOLD) continue;
      actions.push({ type: AiActionType.ATTACK, unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r });
      if (garrisonGuard.guardType) {
        actions.push({ type: AiActionType.SPAWN, q: t.q, r: t.r, unitType: garrisonGuard.guardType });
      }
      continue;
    }
    if (state.moved.has(unit.id)) continue;
    // A garrison in its own endangered village defends in place; it must
    // not march to help a different village and leave home empty.
    if (t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index)) continue;
    const moveTarget = reachableTargets(map, unit, undefined, undefined, undefined, unit.owner).find(
      (c) =>
        !state.occupied.has(key(c.q, c.r)) &&
        hexDistance(c, enemyInVillage) <= unit.attackDistance,
    );
    if (moveTarget) {
      actions.push(
        { type: AiActionType.MOVE, unitId: unit.id, q: moveTarget.q, r: moveTarget.r },
        { type: AiActionType.ATTACK, unitId: unit.id, q: enemyInVillage.q, r: enemyInVillage.r },
      );
    }
  }
  return actions.length > 0 ? actions : null;
}
