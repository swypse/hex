import { BuildingKind } from './events';
import { SkillId } from './skills';
import { UnitType } from './units';

export type SpawnPreference = 'offense' | 'defense' | 'scout' | 'naval';

export type AiGoalId = 'economy' | 'army' | 'defense' | 'naval' | 'score';

export interface AiGoalState {
  id: AiGoalId;
  phase: string;
  target: { q: number; r: number } | null;
  sinceTurn: number;
  confidence: number;
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
  pace: 'rushed' | 'normal' | 'slow';
}

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'heal'; unitId: string; q: number; r: number }
  | { type: 'build'; q: number; r: number; kind: BuildingKind }
  | { type: 'buildRoad'; q: number; r: number }
  | { type: 'buildBridge'; q: number; r: number }
  | { type: 'upgradeShip'; unitId: string }
  | { type: 'openSkill'; skill: SkillId };

export interface AiPlannerState {
  moved: Set<string>;
  acted: Set<string>;
  upgraded: Set<string>;
  spawned: Set<string>;
  built: Set<string>;
  opened: Set<SkillId>;
  occupied: Set<string>;
}
