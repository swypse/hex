import { AiActionType, GarrisonGuardKind } from '@enums';
import { hexDistance } from '../../map/hex';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { isShip } from '../../units/ship';
import type { Unit } from '../../units/units';
import { reachableCells } from '../situation/reachable-cells';
import type { AiAction } from '../types/action';
import type { AiPlannerState } from '../types/planner-state';
import { KILL_MARGIN } from './gang-forecast';
import { isRanged, rankMember, type Member } from './gang-member';
import { guardGarrisonAttack } from './garrison-guard';

/** Units that could step onto `village` once its defender is gone (not the
 *  attackers' own picks), nearest first. */
function villageEnterers(map: GameMap, player: Player, village: MapTile, pool: Unit[], state: AiPlannerState): Unit[] {
  const defender = village.unit;
  village.unit = null;
  const out = pool
    .filter((u) => !isShip(u) && reachableCells(map, player, u).some((c) => c.q === village.q && c.r === village.r))
    .sort((x, y) => hexDistance(x, village) - hexDistance(y, village));
  village.unit = defender;
  return out.filter((u) => !state.acted.has(u.id));
}

/** Plans one coordinated attack on `target` by the units that can reach it.
 *
 *  Order: stunners, ranged units that take no counter, knights, other melee
 *  (least counter damage first), ranged units that do take a counter. Only as
 *  many units as the kill needs attack; the rest stay free. When the target
 *  stands in an enemy village, one unit that can step onto it is held back
 *  (reserved in `state.entry`) so it takes the cell if the defender dies. */
export function planGangAttack(
  map: GameMap,
  player: Player,
  target: MapTile,
  attackers: { unit: Unit; moveTo: MapTile | null }[],
  state: AiPlannerState,
  spare: Unit[] = [],
): AiAction[] {
  const enemy = target.unit;
  if (!enemy) return [];
  const members = attackers
    .map((a) => rankMember(map, player, target, a, state))
    .sort((x, y) => x.rank - y.rank || x.counter - y.counter || y.damage - x.damage);

  // Take attackers in order until the expected damage kills the target.
  let chosen: Member[] = [];
  let sum = 0;
  for (const m of members) {
    chosen.push(m);
    sum += m.damage;
    if (sum >= enemy.hp * KILL_MARGIN) break;
  }
  const lethal = sum >= enemy.hp;

  // Village target: hold one unit back to take the cell.
  const village = target.settlement && target.settlement.owner !== player.index ? target : null;
  let entrant: Unit | null = null;
  if (village && lethal) {
    const chosenIds = new Set(chosen.map((m) => m.unit.id));
    const idle = [...members.map((m) => m.unit).filter((u) => !chosenIds.has(u.id)), ...spare];
    entrant = villageEnterers(map, player, village, idle, state)[0] ?? null;
    if (!entrant) {
      // No spare unit: give up the last melee finisher that is not needed for the kill.
      for (let i = chosen.length - 1; i >= 0; i--) {
        const m = chosen[i]!;
        if (isRanged(m.unit) || sum - m.damage < enemy.hp * KILL_MARGIN) continue;
        if (villageEnterers(map, player, village, [m.unit], state).length === 0) continue;
        entrant = m.unit;
        chosen = chosen.filter((x) => x !== m);
        break;
      }
    }
  }

  const actions: AiAction[] = [];
  for (const m of chosen) {
    const guard = m.moveTo ? null : guardGarrisonAttack(map, player, m.unit, target, state);
    if (guard?.kind === GarrisonGuardKind.HOLD) continue;
    if (m.moveTo) actions.push({ type: AiActionType.MOVE, unitId: m.unit.id, q: m.moveTo.q, r: m.moveTo.r });
    actions.push(
      m.stun
        ? { type: AiActionType.STUN, unitId: m.unit.id, q: target.q, r: target.r }
        : { type: AiActionType.ATTACK, unitId: m.unit.id, q: target.q, r: target.r },
    );
    if (guard?.guardType) {
      const home = map.tiles.find((x) => x.unit === m.unit);
      if (home) actions.push({ type: AiActionType.SPAWN, q: home.q, r: home.r, unitType: guard.guardType });
    }
  }
  if (entrant && village && actions.length > 0) {
    (state.entry ??= []).push({ unitId: entrant.id, q: village.q, r: village.r });
    state.moved.add(entrant.id);
  }
  return actions;
}
