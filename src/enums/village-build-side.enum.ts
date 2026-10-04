/** Shared per-column block-count rules for the village build composite.
 *  Pure and side-effect free so both the game logic (`upgradeVillage`) and
 *  the renderer (`village-build-texture`) agree on column heights. */

/** Column group keys of the village block build (index into `Settlement.build`). */
export enum VillageBuildSide {
  LEFT = 'l',
  RIGHT = 'r',
  LEFT_BACK = 'lBack',
  RIGHT_BACK = 'rBack',
}
