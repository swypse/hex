import type { AiAction } from '../../types/action';

/** One scored option the planner may take: a single action or a short sequence. */
export interface Candidate {
  score: number;
  action: AiAction | AiAction[];
}
