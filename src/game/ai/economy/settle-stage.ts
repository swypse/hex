import { OpeningStage } from '@enums';
import { capitalOf } from '../../economy/stock';
import type { GameMap, MapTile } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { isClaimedBy } from '../situation/is-claimed-by';
import type { AiPlannerState } from '../types/planner-state';
import { key } from '../util/tile-key';
import { reserveLastSlotForMine } from './mine-slot';
import { CAN_BUILD, STAGE_BUILDING, STAGE_SKILLS, stageFeasible } from './opening-stage';

/** Every own village but the first (a captured one) gets a sawmill, then a mine, before other buildings. */
const SETTLE_ORDER = [OpeningStage.SAWMILL, OpeningStage.MINE];

/** Tiles of `village` where the stage's building can be placed now. A sawmill never takes the last
 *  slot a mine is waiting for. */
export function settleSites(map: GameMap, player: Player, village: MapTile, stage: OpeningStage, planned?: AiPlannerState): MapTile[] {
  const kind = STAGE_BUILDING[stage]!;
  return map.tiles.filter(
    (t) => isClaimedBy(t, village) && !planned?.built.has(key(t.q, t.r)) && CAN_BUILD[kind]!(map, t, player) && !(stage === OpeningStage.SAWMILL && reserveLastSlotForMine(map, player, t)),
  );
}

/** The sawmill or mine step a captured village still needs (null once it has both, or cannot have them). */
export function settleStage(map: GameMap, player: Player, village: MapTile, planned?: AiPlannerState): OpeningStage | null {
  const tiles = map.tiles.filter((t) => isClaimedBy(t, village));
  // One build per village per turn: the next step waits for the following plan.
  if (tiles.some((t) => planned?.built.has(key(t.q, t.r)))) return null;
  for (const stage of SETTLE_ORDER) {
    if (tiles.some((t) => t.building?.kind === STAGE_BUILDING[stage])) continue;
    if (!stageFeasible(map, village, stage)) continue;
    // Skills learned and still no place to build it (slots full): skip rather than wait forever.
    if (STAGE_SKILLS[stage].every((sk) => hasSkill(player, sk)) && settleSites(map, player, village, stage, planned).length === 0) continue;
    return stage;
  }
  return null;
}

/** Own villages other than the first that still wait for a sawmill or mine, with the step they need. */
export function pendingSettleVillages(map: GameMap, player: Player, planned?: AiPlannerState): { village: MapTile; stage: OpeningStage }[] {
  const first = capitalOf(map, player.index);
  const out: { village: MapTile; stage: OpeningStage }[] = [];
  for (const village of map.tiles) {
    if (village.settlement?.owner !== player.index || village === first) continue;
    const stage = settleStage(map, player, village, planned);
    if (stage) out.push({ village, stage });
  }
  return out;
}
