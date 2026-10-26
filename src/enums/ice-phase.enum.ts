export enum IcePhase {
  NONE = 'none',
  /** Last autumn turn: coast water freezes next turn. */
  FREEZING = 'freezing',
  /** Last winter turn: the ice melts next turn. */
  CRACKED = 'cracked',
}
