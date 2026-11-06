import type { Player } from '../../players';
import { flagsFor } from '../config/flags';
import { HIT_VILLAGE_MEMORY } from '../config/tuning';

export function isHitVillage(player: Player, tile: { q: number; r: number }, turn: number): boolean {
  const h = player.hitVillage;
  return flagsFor(player).attackPlan && !!h && h.q === tile.q && h.r === tile.r && turn - h.turn <= HIT_VILLAGE_MEMORY;
}
