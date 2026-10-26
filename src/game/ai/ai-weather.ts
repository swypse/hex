import { AiActionType, WeatherType } from '@enums';
import { hexDistance } from '../map/hex';
import { type GameMap } from '../map/map-gen';
import { activeWeather } from '../weather/weather';
import { type AiAction } from './ai-types';

/** Rejects a step that moves a unit onto a tile inside an active tornado's area
 *  (it would take damage at round end). */
export function tornadoVetoed(map: GameMap, step: AiAction[]): boolean {
  const tornadoes = activeWeather(map).filter((e) => e.type === WeatherType.TORNADO);
  if (tornadoes.length === 0) return false;
  return step.some((a) => a.type === AiActionType.MOVE && tornadoes.some((e) => hexDistance(e, a) <= e.radius));
}
