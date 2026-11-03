import type { AuthResult, AuthSession, RegisterInput, UserProfile } from '../../../src/auth/auth-types';
import { isValidCode, isValidEmail, isValidName, isValidPassword, normalizeEmail } from '../../../src/auth/auth-validation';
import { AuthError } from '../../../src/enums/auth-error.enum';
import { constantTimeEqual, hashPassword, randomCode, randomId, randomToken, sha256Hex, verifyPassword } from './crypto';
import type { EmailSender } from './email-sender';
import type { UserRecord, UserRepository } from './user-repository';

const CODE_TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_CODE_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 3600_000;

const fail = (error: AuthError): { ok: false; error: AuthError } => ({ ok: false, error });
const OK: AuthResult = { ok: true, value: undefined };

const profileOf = (u: UserRecord): UserProfile => ({ id: u.id, name: u.name, email: u.email });

/** Registration, e-mail confirmation, login and sessions. Knows nothing about
 *  HTTP or storage: depends on `UserRepository` and `EmailSender` only. */
export class AuthService {
  /** Verified against when the account does not exist, so timing does not reveal it. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly repo: UserRepository,
    private readonly mailer: EmailSender,
    private readonly now: () => number = Date.now,
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    if (!isValidName(name) || !isValidEmail(email) || !isValidPassword(input.password)) {
      return fail(AuthError.INVALID_INPUT);
    }
    const user: UserRecord = {
      id: randomId(),
      name,
      email,
      passwordHash: await hashPassword(input.password),
      confirmed: false,
      createdAt: this.now(),
    };
    if (!(await this.repo.createUser(user))) return fail(AuthError.EMAIL_TAKEN);
    const stored = await this.repo.findByEmail(email);
    return stored ? this.issueCode(stored) : fail(AuthError.INVALID_INPUT);
  }

  async resendCode(emailInput: string): Promise<AuthResult> {
    const user = await this.repo.findByEmail(normalizeEmail(emailInput));
    // Unknown or already confirmed: answer like success so emails cannot be probed.
    if (!user || user.confirmed) return OK;
    const code = await this.repo.getCode(user.id);
    if (code && this.now() - code.sentAt < RESEND_COOLDOWN_MS) return fail(AuthError.RATE_LIMITED);
    return this.issueCode(user);
  }

  async confirm(emailInput: string, codeInput: string): Promise<AuthResult> {
    const user = await this.repo.findByEmail(normalizeEmail(emailInput));
    if (!user || !isValidCode(codeInput)) return fail(AuthError.INVALID_CODE);
    if (user.confirmed) return OK;
    const code = await this.repo.getCode(user.id);
    if (!code) return fail(AuthError.INVALID_CODE);
    if (this.now() > code.expiresAt) {
      await this.repo.deleteCode(user.id);
      return fail(AuthError.CODE_EXPIRED);
    }
    if (code.attempts >= MAX_CODE_ATTEMPTS) {
      await this.repo.deleteCode(user.id);
      return fail(AuthError.TOO_MANY_ATTEMPTS);
    }
    const expected = code.codeHash;
    const actual = await this.codeHash(user.id, codeInput.trim());
    if (!constantTimeEqual(expected, actual)) {
      await this.repo.bumpCodeAttempts(user.id);
      return fail(AuthError.INVALID_CODE);
    }
    await this.repo.setConfirmed(user.id);
    await this.repo.deleteCode(user.id);
    return OK;
  }

  async login(emailInput: string, password: string): Promise<AuthResult<AuthSession>> {
    const user = await this.repo.findByEmail(normalizeEmail(emailInput));
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? (await this.getDummyHash()));
    if (!user || !passwordOk) return fail(AuthError.INVALID_CREDENTIALS);
    if (!user.confirmed) return fail(AuthError.NOT_CONFIRMED);
    const token = randomToken();
    await this.repo.createSession(await sha256Hex(token), {
      userId: user.id,
      expiresAt: this.now() + SESSION_TTL_MS,
    });
    return { ok: true, value: { token, user: profileOf(user) } };
  }

  async logout(token: string): Promise<AuthResult> {
    await this.repo.deleteSession(await sha256Hex(token));
    return OK;
  }

  async me(token: string): Promise<AuthResult<UserProfile>> {
    const hash = await sha256Hex(token);
    const session = await this.repo.getSession(hash);
    if (!session) return fail(AuthError.UNAUTHORIZED);
    if (this.now() > session.expiresAt) {
      await this.repo.deleteSession(hash);
      return fail(AuthError.UNAUTHORIZED);
    }
    const user = await this.repo.findById(session.userId);
    return user?.confirmed ? { ok: true, value: profileOf(user) } : fail(AuthError.UNAUTHORIZED);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(randomToken());
    return this.dummyHash;
  }

  private codeHash(userId: string, code: string): Promise<string> {
    return sha256Hex(`${userId}:${code}`);
  }

  private async issueCode(user: UserRecord): Promise<AuthResult> {
    const code = randomCode();
    const now = this.now();
    await this.repo.saveCode(user.id, {
      codeHash: await this.codeHash(user.id, code),
      expiresAt: now + CODE_TTL_MS,
      sentAt: now,
      attempts: 0,
    });
    try {
      await this.mailer.sendConfirmationCode(user.email, user.name, code);
    } catch (err) {
      console.error('[auth] sending confirmation code failed', err);
      return fail(AuthError.EMAIL_FAILED);
    }
    return OK;
  }
}
