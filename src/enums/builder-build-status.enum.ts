/** Whether a builder can build one of its kinds right now. */
export enum BuilderBuildStatus {
  AVAILABLE = 'available',
  /** No reachable cell passes the kind's placement rules. */
  NO_PLACE = 'noPlace',
  /** There is a place, but no reachable cell is affordable. */
  CANNOT_AFFORD = 'cannotAfford',
}
