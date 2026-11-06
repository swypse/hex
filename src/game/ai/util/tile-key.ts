import { axialKey } from '../../map/hex';

/** The `"q,r"` key of a cell, as used by the planner's sets. */
export function key(q: number, r: number): string {
  return axialKey({ q, r });
}
