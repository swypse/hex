import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { AuthError, AuthStatus, AuthStep } from '@enums';
import { authClient, useAuthStore } from '../src/auth/auth-store';
import { AuthDialog } from '../src/ui/overlays/auth-dialog';

interface DialogInternals {
  step: AuthStep;
  name: string;
  email: string;
  password: string;
  code: string;
  submit(): Promise<void>;
  error: { text: string } | null;
}

const USER = { id: 'u1', name: 'Ann', email: 'ann@example.com' };

function mountDialog(step: AuthStep) {
  const close = vi.fn();
  const app = { screen: { width: 800, height: 600 } } as never;
  const dialog = new AuthDialog(app, step, close);
  dialog.mount(new Container());
  return { dialog, close, internals: dialog as unknown as DialogInternals };
}

describe('AuthDialog', () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = { createElement: () => ({ getContext: () => null, width: 0, height: 0 }) };
    useAuthStore.setState({ status: AuthStatus.ANONYMOUS, user: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates the registration form locally', async () => {
    const register = vi.spyOn(authClient, 'register');
    const { internals } = mountDialog(AuthStep.REGISTER);
    internals.name = 'Ann';
    internals.email = 'not-an-email';
    internals.password = 'longenough1';
    await internals.submit();
    expect(register).not.toHaveBeenCalled();
    expect(internals.error?.text).toBe('Check the name, email and password (8+ characters).');
  });

  it('register → confirm → auto login closes the dialog', async () => {
    vi.spyOn(authClient, 'register').mockResolvedValue({ ok: true, value: undefined });
    const confirm = vi.spyOn(authClient, 'confirm').mockResolvedValue({ ok: true, value: undefined });
    vi.spyOn(authClient, 'login').mockResolvedValue({ ok: true, value: { token: 'tok', user: USER } });
    const { internals, close } = mountDialog(AuthStep.REGISTER);
    internals.name = 'Ann';
    internals.email = 'Ann@Example.com';
    internals.password = 'longenough1';
    await internals.submit();
    expect(internals.step).toBe(AuthStep.CONFIRM);
    expect(internals.email).toBe('ann@example.com');

    internals.code = '123456';
    await internals.submit();
    expect(confirm).toHaveBeenCalledWith('ann@example.com', '123456');
    expect(close).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: AuthStatus.AUTHENTICATED, user: USER });
  });

  it('login of an unconfirmed account moves to code entry', async () => {
    vi.spyOn(authClient, 'login').mockResolvedValue({ ok: false, error: AuthError.NOT_CONFIRMED });
    const resend = vi.spyOn(authClient, 'resendCode').mockResolvedValue({ ok: true, value: undefined });
    const { internals, close } = mountDialog(AuthStep.LOGIN);
    internals.email = 'ann@example.com';
    internals.password = 'longenough1';
    await internals.submit();
    expect(internals.step).toBe(AuthStep.CONFIRM);
    expect(resend).toHaveBeenCalledWith('ann@example.com');
    expect(close).not.toHaveBeenCalled();
  });

  it('shows the server error on a bad login', async () => {
    vi.spyOn(authClient, 'login').mockResolvedValue({ ok: false, error: AuthError.INVALID_CREDENTIALS });
    const { internals } = mountDialog(AuthStep.LOGIN);
    internals.email = 'ann@example.com';
    internals.password = 'wrong';
    await internals.submit();
    expect(internals.error?.text).toBe('Wrong email or password.');
  });
});
