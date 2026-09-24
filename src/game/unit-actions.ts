import { attackableTargets } from './combat';
import { GameMap, MapTile } from './map-gen';
import { Player } from './players';
import { reachableTargets } from './selection';
import { hasSkill } from './skills';
import { canAttack, canHeal, canMove, movePoints, Unit } from './units';

export function unitCanAct(map: GameMap, tile: MapTile, unit: Unit, player: Player): boolean {
  if ((unit.stunTurns ?? 0) >= 1) return false;
  const canClimb = hasSkill(player, 'climbing');
  const canDock = hasSkill(player, 'navigation');
  const canMoveAnywhere =
    canMove(unit) && reachableTargets(map, unit, movePoints(unit), canClimb, canDock, player.index).length > 0;
  const canAttackAny = canAttack(unit) && attackableTargets(map, unit, player.index).length > 0;
  const canHealNow = canHeal(unit);
  const canCapture =
    tile.settlement !== null && tile.settlement.owner !== unit.owner && tile.settlement.captureReady;
  return canMoveAnywhere || canAttackAny || canHealNow || canCapture;
}
