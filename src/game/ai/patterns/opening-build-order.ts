import { openingAction } from '../economy/opening-action';
import type { AiAction } from '../types/action';
import type { AiPatternContext } from './pattern-types';

/** The opening build order of the first village: upgrade, sawmill, mine, farm,
 *  granary. Placed after the fighting patterns so danger still comes first. */
export const OPENING_PATTERN = {
  id: 'opening-build-order',
  priority: 72,
  evaluate: ({ map, player, state }: AiPatternContext): AiAction[] | null => openingAction(map, player, state),
};
