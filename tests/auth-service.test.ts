import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../worker/src/auth/auth-service';
import type { EmailSender } from '../worker/src/auth/email-sender';
import { MemoryUserRepository } from '../worker/src/auth/memory-user-repository';
import { AuthError } from '../src/enums/auth-error.enum';

class CapturingSender implements EmailSender {
  codes: string[] = [];
  fail = false;
  async sendConfirmationCode(_to: string, _name: string, code: string): Promise<void> {
    if (this.fail) throw new Error('smtp down');
    this.codes.push(code);
  }
  get last(): string {
    return this.codes[this.codes.length - 1]!;
  }
}

const INPUT = { name: 'Ann', email: 'Ann@Example.com ', password: 'hunter2hunter2' };

describe('AuthService', () => {
  let clock: number;
  let mailer: CapturingSender;
  let service: AuthService;

  beforeEach(() => {
    clock = 1_000_000;
    mailer = new CapturingSender();
    service = new AuthService(new MemoryUserRepository(), mailer, () => clock);
  });

  it('rejects invalid input', async () => {
    expect(await service.register({ ...INPUT, name: ' ' })).toEqual({ ok: false, error: AuthError.INVALID_INPUT });
    expect(await service.register({ ...INPUT, email: 'nope' })).toEqual({ ok: false, error: AuthError.INVALID_INPUT });
    expect(await service.register({ ...INPUT, password: 'short' })).toEqual({ ok: false, error: AuthError.INVALID_INPUT });
  });

  it('registers, mails a 6-digit code and blocks login until confirmed', async () => {
    expect((await service.register(INPUT)).ok).toBe(true);
    expect(mailer.last).toMatch(/^\d{6}$/);
    expect(await service.login('ann@example.com', INPUT.password)).toEqual({ ok: false, error: AuthError.NOT_CONFIRMED });
  });

  it('confirms with the code, then logs in with normalized email', async () => {
    await service.register(INPUT);
    expect((await service.confirm('ann@example.com', mailer.last)).ok).toBe(true);
    const login = await service.login('  ANN@example.com', INPUT.password);
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.value.user).toMatchObject({ name: 'Ann', email: 'ann@example.com' });
    expect(await service.me(login.value.token)).toEqual({ ok: true, value: login.value.user });
  });

  it('does not reveal whether an account exists on bad login', async () => {
    await service.register(INPUT);
    await service.confirm(INPUT.email, mailer.last);
    const wrongPassword = await service.login(INPUT.email, 'wrong-password');
    const unknown = await service.login('who@example.com', 'wrong-password');
    expect(wrongPassword).toEqual({ ok: false, error: AuthError.INVALID_CREDENTIALS });
    expect(unknown).toEqual(wrongPassword);
  });

  it('rejects a taken email only once confirmed; unconfirmed can re-register', async () => {
    await service.register(INPUT);
    expect((await service.register({ ...INPUT, name: 'Ann2', password: 'another-pass-1' })).ok).toBe(true);
    await service.confirm(INPUT.email, mailer.last);
    expect(await service.register(INPUT)).toEqual({ ok: false, error: AuthError.EMAIL_TAKEN });
    // the re-registration replaced the password
    expect((await service.login(INPUT.email, 'another-pass-1')).ok).toBe(true);
  });

  it('counts wrong codes and locks after 5 attempts', async () => {
    await service.register(INPUT);
    const wrong = mailer.last === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect(await service.confirm(INPUT.email, wrong)).toEqual({ ok: false, error: AuthError.INVALID_CODE });
    }
    // even the right code is refused now
    expect(await service.confirm(INPUT.email, mailer.last)).toEqual({ ok: false, error: AuthError.TOO_MANY_ATTEMPTS });
  });

  it('expires the code after 10 minutes', async () => {
    await service.register(INPUT);
    clock += 10 * 60_000 + 1;
    expect(await service.confirm(INPUT.email, mailer.last)).toEqual({ ok: false, error: AuthError.CODE_EXPIRED });
  });

  it('throttles resend and issues a fresh code after the cooldown', async () => {
    await service.register(INPUT);
    expect(await service.resendCode(INPUT.email)).toEqual({ ok: false, error: AuthError.RATE_LIMITED });
    clock += 60_000;
    expect((await service.resendCode(INPUT.email)).ok).toBe(true);
    expect(mailer.codes).toHaveLength(2);
    expect((await service.confirm(INPUT.email, mailer.last)).ok).toBe(true);
  });

  it('reports a mail failure', async () => {
    mailer.fail = true;
    expect(await service.register(INPUT)).toEqual({ ok: false, error: AuthError.EMAIL_FAILED });
  });

  it('logout and expiry invalidate the session', async () => {
    await service.register(INPUT);
    await service.confirm(INPUT.email, mailer.last);
    const a = await service.login(INPUT.email, INPUT.password);
    const b = await service.login(INPUT.email, INPUT.password);
    if (!a.ok || !b.ok) throw new Error('login failed');
    await service.logout(a.value.token);
    expect(await service.me(a.value.token)).toEqual({ ok: false, error: AuthError.UNAUTHORIZED });
    clock += 31 * 24 * 3600_000;
    expect(await service.me(b.value.token)).toEqual({ ok: false, error: AuthError.UNAUTHORIZED });
  });
});
