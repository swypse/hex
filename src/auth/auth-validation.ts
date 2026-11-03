export const NAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const CODE_LENGTH = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= 254 && EMAIL_RE.test(e);
}

export function isValidName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && n.length <= NAME_MAX;
}

export function isValidPassword(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

export function isValidCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());
}
