import { AiActionType, BuildingKind, SkillId, UnitType, VillageUpgradeBonus } from '@enums';
import type { BuilderBuildKind } from '../../economy/buildings';

export type AiAction =
  | { type: AiActionType.UPGRADE; q: number; r: number; bonus?: VillageUpgradeBonus }
  | { type: AiActionType.MOVE; unitId: string; q: number; r: number }
  | { type: AiActionType.ATTACK; unitId: string; q: number; r: number }
  | { type: AiActionType.STUN; unitId: string; q: number; r: number }
  | { type: AiActionType.SPAWN; q: number; r: number; unitType: UnitType }
  | { type: AiActionType.CAPTURE; q: number; r: number; unitId: string }
  | { type: AiActionType.HEAL; unitId: string; q: number; r: number }
  | { type: AiActionType.BUILD; q: number; r: number; kind: BuildingKind }
  | { type: AiActionType.BUILD_ROAD; q: number; r: number }
  | { type: AiActionType.BUILD_BRIDGE; q: number; r: number }
  | { type: AiActionType.DESTROY_BUILDING; q: number; r: number }
  | { type: AiActionType.UPGRADE_SHIP; unitId: string }
  | { type: AiActionType.REPAIR; q: number; r: number }
  | { type: AiActionType.EXTINGUISH; unitId: string; q: number; r: number }
  | { type: AiActionType.ENABLE_STEALTH; unitId: string }
  | { type: AiActionType.STORM; unitId: string }
  | { type: AiActionType.LIGHTNING; unitId: string; q: number; r: number }
  | { type: AiActionType.TRAP; unitId: string; q: number; r: number }
  | { type: AiActionType.BURN; unitId: string }
  | { type: AiActionType.BURN_ROAD; unitId: string }
  | { type: AiActionType.BUILDER_BUILD; unitId: string; q: number; r: number; kind: BuilderBuildKind }
  | { type: AiActionType.OPEN_SKILL; skill: SkillId };
