/** Vertical wave bob amplitude (world px) for a water tile. */
export const WATER_WAVE_AMPLITUDE = 1.2;
/** Full up-down cycle time (ms) of a single water tile's wave. */
export const WATER_WAVE_PERIOD = 5000;

/** Vertical world-y offset for a water tile at column `q` and time `now` (ms).
 *  Even-q diagonals ride the crest (negative y = up on screen) exactly when
 *  odd-q diagonals ride the trough, so neighbouring wave lines are always in
 *  opposite phases. */
export function waterWaveOffset(q: number, now: number): number {
  const phase = q % 2 === 0 ? -1 : 1;
  return phase * WATER_WAVE_AMPLITUDE * Math.cos((now / WATER_WAVE_PERIOD) * Math.PI * 2);
}
