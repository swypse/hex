import { AiActionType,GarrisonGuardKind,UnitType } from '@enums';
import type { GameMap,MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { attackableTargets,attackDamage,isPoorTrapperTarget } from '../../units/combat';
import type { Unit } from '../../units/units';
import { enemyCanReach } from '../situation/enemy-reach';
import { idleUnits } from '../situation/idle-units';
import { reachableCells } from '../situation/reachable-cells';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { isSupportUnit } from '../unit-roles/is-support-unit';
import { key } from '../util/tile-key';
import { guardGarrisonAttack } from './garrison-guard';

export function attackersForTile(
  map: GameMap,
  player: Player,
  targetTile: MapTile,
  state: AiPlannerState,
): { unit: Unit; moveTo: MapTile | null }[] {
  const out: { unit: Unit; moveTo: MapTile | null }[] = [];
  for (const { tile: t, unit } of idleUnits(map, player, state)) {
    // Support units and stalkers never join a gang-up: the builder/trapper/
    // banner have jobs to do and the stalker only strikes to free a village.
    if (isSupportUnit(unit) || unit.type === UnitType.STALKER) continue;
    const endangeredGarrison =
      !!t.settlement && t.settlement.owner === player.index && enemyCanReach(map, t, player.index);
    if (attackableTargets(map, unit, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
      out.push({ unit, moveTo: null });
      continue;
    }
    // A garrison in an endangered village may defend in place, but it must
    // never march away to join a distant fight (that would leave the village
    // empty for an enemy that can reach it next turn).
    if (endangeredGarrison) continue;
    for (const c of reachableCells(map, player, unit)) {
      if (state.occupied.has(key(c.q, c.r))) continue;
      const ghost: Unit = { ...unit, q: c.q, r: c.r };
      if (attackableTargets(map, ghost, player.index).some((a) => a.q === targetTile.q && a.r === targetTile.r)) {
        out.push({ unit, moveTo: c });
        break;
      }
    }
  }
  const target = targetTile.unit;
  if (!target || target.type !== UnitType.TRAPPER) return out;
  // A trapper is worn down by ranged units; a melee unit joins only when it
  // finishes the job (so it takes no counter).
  const poor = (a: { unit: Unit }): boolean => isPoorTrapperTarget(a.unit, target);
  const rangedDamage = out.filter((a) => !poor(a) && a.unit.attackDistance > 1).reduce((s, a) => s + attackDamage(a.unit), 0);
  return out
    .filter((a) => !poor(a) || rangedDamage + attackDamage(a.unit) >= target.hp)
    .sort((a, b) => Number(a.unit.attackDistance <= 1) - Number(b.unit.attackDistance <= 1));
}

/** Attack steps for a gang-up on `target`: each attacker moves into range if
 *  needed and strikes. A garrison joining from its own village without moving
 *  may take a lethal counter: it holds, or a spawn covers the village. */
export function gangAttackActions(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
): AiAction[] {
  const actions: AiAction[] = [];
  for (const a of attackers) {
    const garrisonGuard = a.moveTo ? null : guardGarrisonAttack(map, player, a.unit, target, state);
    if (garrisonGuard?.kind === GarrisonGuardKind.HOLD) continue;
    if (a.moveTo) actions.push({ type: AiActionType.MOVE, unitId: a.unit.id, q: a.moveTo.q, r: a.moveTo.r });
    actions.push({ type: AiActionType.ATTACK, unitId: a.unit.id, q: target.q, r: target.r });
    if (garrisonGuard?.guardType) {
      const home = map.tiles.find((x) => x.unit === a.unit);
      if (home) actions.push({ type: AiActionType.SPAWN, q: home.q, r: home.r, unitType: garrisonGuard.guardType });
    }
  }
  return actions;
}
