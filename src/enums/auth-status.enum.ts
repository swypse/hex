export enum AuthStatus {
  /** Stored session not checked against the server yet. */
  UNKNOWN = 'unknown',
  /** The API is unreachable: accounts are unavailable. */
  OFFLINE = 'offline',
  ANONYMOUS = 'anonymous',
  AUTHENTICATED = 'authenticated',
}
