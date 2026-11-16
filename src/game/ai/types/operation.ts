import { AiOperationPhase } from '@enums';

/** A persistent multi-unit plan against one enemy village: the squad first
 *  gathers at a rally hex near the target, then advances on it together. */
export interface AiOperation {
  target: { q: number; r: number };
  rally: { q: number; r: number };
  phase: AiOperationPhase;
  startTurn: number;
  /** While true, no squad member may advance more than 2 hexes past the rearmost. */
  leash: boolean;
  /** Focused assault in progress (`AiFlags.focusAssault`): the squad fights on through losses until aborted. */
  committed: boolean;
  /** The squad lacks a clear advantage over the target's defenders: own villages near it raise reinforcements. */
  reinforce: boolean;
}
