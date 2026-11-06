import { SeededRandom } from '../../../util/random';
import type { GameMap } from '../../map/map-gen';
import type { Player } from '../../players';
import type { AiDifficultyProfile } from '../config/difficulty';
import type { AiSituation } from '../situation/situation';
import type { AiAction } from '../types/action';
import type { AiDirectives } from '../types/directives';
import type { AiOperation } from '../types/operation';
import type { AiPlannerState } from '../types/planner-state';

export interface AiPatternContext {
  map: GameMap;
  player: Player;
  rng: SeededRandom;
  state: AiPlannerState;
  situation?: AiSituation;
  difficulty?: AiDifficultyProfile;
  directives?: AiDirectives;
  operation?: AiOperation | null;
  /** The game turn being planned (0 when the caller did not pass it). */
  turn?: number;
}

export interface AiPattern {
  id: string;
  priority: number;
  evaluate(ctx: AiPatternContext): AiAction[] | null;
}
