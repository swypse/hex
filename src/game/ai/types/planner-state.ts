import { BuildingKind, SkillId } from '@enums';

export interface AiPlannerState {
  moved: Set<string>;
  acted: Set<string>;
  upgraded: Set<string>;
  spawned: Set<string>;
  built: Set<string>;
  opened: Set<SkillId>;
  occupied: Set<string>;
  /** Kinds of buildings planned this turn (not yet on the board in snapshot planning). */
  plannedKinds?: Set<BuildingKind>;
  /** Units held back to step onto an enemy village once its defender dies. */
  entry?: { unitId: string; q: number; r: number }[];
  /** A lightning was already called this turn (it recharges for several turns). */
  lightningCalled?: boolean;
}
