import { hasPirateDeal, type Unit } from '../game/units';

/** Glow behind the player's own selected unit (and neutral ones): cyan. */
export const OWN_GLOW_COLOR = 0x00ffff;
/** Glow behind a selected enemy unit: red. */
export const ENEMY_GLOW_COLOR = 0xff2d2d;

/** Colour of the selection glow of `unit` as seen by `localPlayerIndex`. Every
 *  unit that is not the player's own glows red, except a pirate the player has
 *  a deal with: it will not attack them, so it keeps the normal glow. */
export function unitGlowColor(unit: Pick<Unit, 'owner' | 'type' | 'paidBy'>, localPlayerIndex: number): number {
  if (unit.owner === localPlayerIndex) return OWN_GLOW_COLOR;
  if (hasPirateDeal(unit as Unit, localPlayerIndex)) return OWN_GLOW_COLOR;
  return ENEMY_GLOW_COLOR;
}
