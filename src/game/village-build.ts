/** Shared per-column block-count rules for the village build composite.
 *  Pure and side-effect free so both the game logic (`upgradeVillage`) and
 *  the renderer (`village-build-texture`) agree on column heights. */

/** Column group keys of the village block build (index into `Settlement.build`). */
export type VillageBuildSide = 'l' | 'r' | 'lBack' | 'rBack';

/** Number of columns per group. */
export const VILLAGE_BUILD_COLUMN_COUNTS: Record<VillageBuildSide, number> = {
  l: 3,
  r: 2,
  lBack: 2,
  rBack: 1,
};

/** True when a column carries one extra block on even levels. Tall columns
 *  are the inner main-side ones (left 2–3, right 1–2); left column 1 and
 *  every back column stay short. */
export function isVillageTallColumn(side: VillageBuildSide, column: number): boolean {
  if (side === 'l') return column >= 1;
  if (side === 'r') return column <= 1;
  return false;
}

/** Total blocks (top + below-top) of a column at a village level: the short
 *  baseline is `ceil(level / 2)`; tall columns gain one more block on even
 *  levels. Level 1 → all columns 1 block; level 2 → tall only get a 2nd;
 *  level 3 → all get a 2nd; level 4 → tall only get a 3rd; and so on. */
export function villageColumnBlocks(side: VillageBuildSide, column: number, level: number): number {
  const base = Math.ceil(level / 2);
  return isVillageTallColumn(side, column) && level % 2 === 0 ? base + 1 : base;
}

/** Below-top blocks of a column at a village level (`villageColumnBlocks - 1`). */
export function villageColumnMiddleCount(side: VillageBuildSide, column: number, level: number): number {
  return villageColumnBlocks(side, column, level) - 1;
}