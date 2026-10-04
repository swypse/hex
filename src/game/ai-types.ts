import { BuilderBuildKind } from './buildings';
import { AiActionType, AiGoalId, AiOperationPhase, AiPace, BuildingKind, SkillId, SpawnPreference, UnitType } from '@enums';





export interface AiGoalState {
  id: AiGoalId;
  phase: string;
  target: { q: number; r: number } | null;
}

export interface AiStrategyState {
  personalityId: string;
  nextPlanTurn: number;
  goals: AiGoalState[];
}

export interface AiDirectives {
  frontTarget: { q: number; r: number } | null;
  muster: { tile: { q: number; r: number } | null; minUnits: number; target: { q: number; r: number } } | null;
  spawnPlan: { villageKey: string; prefer: SpawnPreference }[];
  moneyReserve: number;
  skillChain: SkillId[] | null;
  pace: AiPace;
}

export type AiAction =
  | { type: AiActionType.UPGRADE; q: number; r: number }
  | { type: AiActionType.MOVE; unitId: string; q: number; r: number }
  | { type: AiActionType.ATTACK; unitId: string; q: number; r: number }
  | { type: AiActionType.STUN; unitId: string; q: number; r: number }
  | { type: AiActionType.SPAWN; q: number; r: number; unitType: UnitType }
  | { type: AiActionType.CAPTURE; q: number; r: number; unitId: string }
  | { type: AiActionType.HEAL; unitId: string; q: number; r: number }
  | { type: AiActionType.BUILD; q: number; r: number; kind: BuildingKind }
  | { type: AiActionType.BUILD_ROAD; q: number; r: number }
  | { type: AiActionType.BUILD_BRIDGE; q: number; r: number }
  | { type: AiActionType.UPGRADE_SHIP; unitId: string }
  | { type: AiActionType.ENABLE_STEALTH; unitId: string }
  | { type: AiActionType.STORM; unitId: string }
  | { type: AiActionType.TRAP; unitId: string; q: number; r: number }
  | { type: AiActionType.BURN; unitId: string }
  | { type: AiActionType.BURN_ROAD; unitId: string }
  | { type: AiActionType.BUILDER_BUILD; unitId: string; q: number; r: number; kind: BuilderBuildKind }
  | { type: AiActionType.OPEN_SKILL; skill: SkillId };

export interface AiPlannerState {
  moved: Set<string>;
  acted: Set<string>;
  upgraded: Set<string>;
  spawned: Set<string>;
  built: Set<string>;
  opened: Set<SkillId>;
  occupied: Set<string>;
}

/** A persistent multi-unit plan against one enemy village: the squad first
 *  gathers at a rally hex near the target, then advances on it together. */
export interface AiOperation {
  target: { q: number; r: number };
  rally: { q: number; r: number };
  phase: AiOperationPhase;
  startTurn: number;
  /** While true, no squad member may advance more than 2 hexes past the rearmost. */
  leash: boolean;
}
