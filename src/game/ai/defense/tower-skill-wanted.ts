import { SkillId } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import { hasSkill } from '../../skills';
import { flagsFor } from '../config/flags';
import { towerThreat } from './tower-threat';

/** The next skill on the way to Tower while some own village is under pressure, or null. */
export function towerSkillWanted(map: GameMap, player: Player): SkillId | null {
  if (!flagsFor(player).towers || hasSkill(player, SkillId.TOWER)) return null;
  const pressed = map.tiles.some((t) => t.settlement?.owner === player.index && towerThreat(map, player, t) !== null);
  if (!pressed) return null;
  if (hasSkill(player, SkillId.DEFENSE)) return SkillId.TOWER;
  return hasSkill(player, SkillId.SHIELDS) ? SkillId.DEFENSE : SkillId.SHIELDS;
}
