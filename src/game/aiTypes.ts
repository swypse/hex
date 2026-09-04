import { BuildingKind } from './events';
import { SkillId } from './skills';
import { UnitType } from './units';

export type AiAction =
  | { type: 'upgrade'; q: number; r: number }
  | { type: 'move'; unitId: string; q: number; r: number }
  | { type: 'attack'; unitId: string; q: number; r: number }
  | { type: 'spawn'; q: number; r: number; unitType: UnitType }
  | { type: 'capture'; q: number; r: number; unitId: string }
  | { type: 'heal'; unitId: string; q: number; r: number }
  | { type: 'build'; q: number; r: number; kind: BuildingKind }
  | { type: 'buildBridge'; q: number; r: number }
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
