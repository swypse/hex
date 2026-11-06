import type { AiAction } from '../types/action';

/** Diagnostics hook (benchmarks): called with the id of the pattern (or 'fallback') behind every planned step. */
export const aiStepTrace: { hook: ((id: string, steps: AiAction[]) => void) | null } = { hook: null };
