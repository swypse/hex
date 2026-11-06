import type { AiGoalState } from './goal-state';

export interface AiStrategyState {
  personalityId: string;
  nextPlanTurn: number;
  goals: AiGoalState[];
}
