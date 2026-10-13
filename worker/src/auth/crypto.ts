import { CODE_LENGTH } from '../../../src/auth/auth-validation';

/** Workers cap PBKDF2 at 100k iterations. */
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const TOKEN_BYTES = 32;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/** `pbkdf2$<iterations>$<salt b64>$<hash b64>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(SALT_BYTES)));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iterations || !salt || !hash) return false;
  const actual = await pbkdf2(password, fromBase64(salt), Number(iterations));
  return timingSafeEqual(actual, fromBase64(hash));
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text))));
}

/** Uniform random numeric code (rejection sampling, no modulo bias). */
export function randomCode(): string {
  const limit = 2 ** 32 - (2 ** 32 % 10 ** CODE_LENGTH);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0]! >= limit);
  return String(buf[0]! % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, '0');
}

export function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function constantTimeEqual(a: string, b: string): boolean {
  return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}
