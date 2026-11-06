import { AiGoalId } from '@enums';

export interface AiGoalState {
  id: AiGoalId;
  phase: string;
  target: { q: number; r: number } | null;
}
