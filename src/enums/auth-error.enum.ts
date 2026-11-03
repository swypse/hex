/** Failure reasons of the auth API; sent over the wire and mapped to i18n keys `auth.error.<value>`. */
export enum AuthError {
  INVALID_INPUT = 'invalid_input',
  EMAIL_TAKEN = 'email_taken',
  INVALID_CREDENTIALS = 'invalid_credentials',
  NOT_CONFIRMED = 'not_confirmed',
  INVALID_CODE = 'invalid_code',
  CODE_EXPIRED = 'code_expired',
  TOO_MANY_ATTEMPTS = 'too_many_attempts',
  RATE_LIMITED = 'rate_limited',
  UNAUTHORIZED = 'unauthorized',
  EMAIL_FAILED = 'email_failed',
  NETWORK = 'network',
}
