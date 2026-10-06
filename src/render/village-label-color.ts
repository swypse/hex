import { Tribe, type TribeInfo } from '../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../game/discovery';
import { contrastTextColor } from '../gfx/theme';

const WHITE = 0xffffff;
const BLACK = 0x000000;

/** Text colour of a village (or granary) name plate. Plates are white-on-colour
 *  for every tribe except the Sand people, whose light yellow plate needs black
 *  text. Plates of tribes not met yet use a neutral colour, where plain
 *  contrast decides. */
export function villageLabelTextColor(tribe: TribeInfo, known: boolean): number {
  if (!known) return contrastTextColor(UNKNOWN_TRIBE_COLOR);
  return tribe.id === Tribe.Sand ? BLACK : WHITE;
}
