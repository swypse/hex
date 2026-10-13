export enum AuthStatus {
  /** Stored session not checked against the server yet. */
  UNKNOWN = 'unknown',
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
}
