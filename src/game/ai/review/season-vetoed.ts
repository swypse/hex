import { AiActionType } from '@enums';
import type { GameMap } from '../../map/map-gen';
import type { AiAction } from '../types/action';
import { seasonUnsafe } from './season-unsafe';

/** Rejects a step that moves a unit onto a tile that is unsafe at season end. */
export function seasonVetoed(map: GameMap, turn: number, step: AiAction[]): boolean {
  for (const a of step) {
    if (a.type !== AiActionType.MOVE) continue;
    const from = map.tiles.find((t) => t.unit?.id === a.unitId);
    const dest = map.tiles.find((t) => t.q === a.q && t.r === a.r);
    if (from?.unit && dest && seasonUnsafe(map, turn, dest, from.unit)) return true;
  }
  return false;
}
