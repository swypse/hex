import type { AiGoalState } from '../types/goal-state';

export function goalTargetKey(g: AiGoalState): string {
  return g.target ? `${g.target.q},${g.target.r}` : '';
}
