/** Order in which a group hits one target (lower first). */
export enum AttackRank {
  STUN = 0,
  RANGED_FREE = 1,
  KNIGHT = 2,
  MELEE = 3,
  RANGED_COUNTERED = 4,
}
