import { type Application, type BitmapText, type Container } from 'pixi.js';
import { authClient, useAuthStore } from '../../auth/auth-store';
import type { AuthResult } from '../../auth/auth-types';
import { isValidCode, isValidEmail, isValidName, isValidPassword, normalizeEmail } from '../../auth/auth-validation';
import { makeLabel } from '../../gfx/label';
import { t } from '../../i18n';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { TextInputOverlay } from '../kit/text-input-overlay';
import { AuthError, AuthStep, FontSize } from '@enums';

const WIDTH = 360;
const FIELD_HEIGHT = 34;
const ERROR_COLOR = 0xff8a80;
const INFO_COLOR = 0x9be29b;

/** Login / register / e-mail confirmation as one popup that swaps its body. */
export class AuthDialog {
  private popup: Popup | null = null;
  private inputs: TextInputOverlay[] = [];
  private error: BitmapText | null = null;
  private info: BitmapText | null = null;
  private primary: Button | null = null;
  private busy = false;
  private destroyed = false;

  private name = '';
  private email = '';
  private password = '';
  private code = '';

  constructor(
    private readonly app: Application,
    private step: AuthStep,
    private readonly onClose: () => void,
  ) {}

  private container: Container | null = null;

  mount(container: Container): void {
    this.container = container;
    this.render();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.destroyed = true;
    this.teardown();
  }

  private teardown(): void {
    this.inputs.forEach((i) => i.destroy());
    this.inputs = [];
    this.popup?.destroy();
    this.popup = null;
    this.error = null;
    this.info = null;
    this.primary = null;
  }

  private titleKey(): string {
    return { [AuthStep.LOGIN]: 'auth.loginTitle', [AuthStep.REGISTER]: 'auth.registerTitle', [AuthStep.CONFIRM]: 'auth.confirmTitle' }[this.step];
  }

  private render(notice?: { text: string; ok: boolean }): void {
    if (!this.container || this.destroyed) return;
    this.teardown();
    const step = this.step;
    const primary = new Button({
      label: t(step === AuthStep.LOGIN ? 'auth.login' : step === AuthStep.REGISTER ? 'auth.register' : 'auth.confirm'),
      width: 150,
      onClick: () => void this.submit(),
    });
    const cancel = new Button({ label: t('common.cancel'), width: 110, onClick: this.onClose });
    const popup = new Popup({ app: this.app, title: t(this.titleKey()), width: WIDTH, buttons: [primary, cancel], onClose: this.onClose });
    this.popup = popup;
    this.primary = primary;

    let y = 0;
    const text = (value: string, fill = 0xeeeeee): BitmapText => {
      const label = makeLabel(value, { fontSize: FontSize.SMALL, fill, wordWrap: true, wordWrapWidth: popup.contentWidth });
      label.position.set(0, y);
      popup.content.addChild(label);
      y += label.height + 6;
      return label;
    };
    const field = (labelKey: string, value: string, onChange: (v: string) => void, type: 'text' | 'password' = 'text'): void => {
      text(t(labelKey));
      const input = new TextInputOverlay({
        x: 0, y, width: popup.contentWidth, height: FIELD_HEIGHT, value, type, onChange,
        origin: () => popup.contentScreenOrigin(),
      });
      this.inputs.push(input);
      popup.content.addChild(input.container);
      y += FIELD_HEIGHT + 10;
    };
    const link = (labelKey: string, onClick: () => void): void => {
      const btn = new Button({ label: t(labelKey), fontSize: FontSize.SMALL, shadow: false, onClick });
      btn.position.set(0, y);
      popup.content.addChild(btn);
      y += btn.height + 6;
    };

    if (step === AuthStep.CONFIRM) {
      text(t('auth.confirmHint', { email: this.email }));
      field('auth.code', this.code, (v) => (this.code = v.trim()));
      link('auth.resend', () => void this.resend());
    } else {
      if (step === AuthStep.REGISTER) field('auth.name', this.name, (v) => (this.name = v));
      field('auth.email', this.email, (v) => (this.email = v));
      field('auth.password', this.password, (v) => (this.password = v), 'password');
      if (step === AuthStep.REGISTER) text(t('auth.passwordHint'), 0xaaaaaa);
      link(step === AuthStep.LOGIN ? 'auth.toRegister' : 'auth.toLogin', () => {
        this.step = step === AuthStep.LOGIN ? AuthStep.REGISTER : AuthStep.LOGIN;
        this.render();
      });
    }
    // Two labels in one slot: colour is a label property (no tinting of baked glyphs).
    const slotY = y;
    this.error = text(notice && !notice.ok ? notice.text : '', ERROR_COLOR);
    y = slotY;
    this.info = text(notice?.ok ? notice.text : '', INFO_COLOR);
    this.container.addChild(popup.el);
    popup.finish();
  }

  /** Shows `error` / `info` without rebuilding the popup (keeps typed text). */
  private show(text: string, ok = false): void {
    if (!this.error || !this.info || this.destroyed) return;
    this.error.text = ok ? '' : text;
    this.info.text = ok ? text : '';
    this.popup?.reflow();
  }

  private showError(error: AuthError): void {
    this.show(t(`auth.error.${error}`));
  }

  private async run(task: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.primary) this.primary.disabled = true;
    try {
      await task();
    } finally {
      this.busy = false;
      if (this.primary && !this.destroyed) this.primary.disabled = false;
    }
  }

  private submit(): Promise<void> {
    return this.run(async () => {
      switch (this.step) {
        case AuthStep.LOGIN:
          return this.submitLogin();
        case AuthStep.REGISTER:
          return this.submitRegister();
        case AuthStep.CONFIRM:
          return this.submitConfirm();
      }
    });
  }

  private async submitLogin(): Promise<void> {
    if (!isValidEmail(this.email) || this.password === '') return this.showError(AuthError.INVALID_CREDENTIALS);
    const res = await useAuthStore.getState().login(this.email, this.password);
    if (this.destroyed) return;
    if (res.ok) return this.onClose();
    if (res.error === AuthError.NOT_CONFIRMED) {
      // The code may be lost; a rate-limited resend just means it is still valid.
      void authClient.resendCode(this.email);
      this.step = AuthStep.CONFIRM;
      return this.render();
    }
    this.showError(res.error);
  }

  private async submitRegister(): Promise<void> {
    if (!isValidName(this.name) || !isValidEmail(this.email) || !isValidPassword(this.password)) {
      return this.showError(AuthError.INVALID_INPUT);
    }
    const res = await authClient.register({ name: this.name.trim(), email: this.email, password: this.password });
    if (this.destroyed) return;
    if (!res.ok) return this.showError(res.error);
    this.email = normalizeEmail(this.email);
    this.step = AuthStep.CONFIRM;
    this.render();
  }

  private async submitConfirm(): Promise<void> {
    if (!isValidCode(this.code)) return this.showError(AuthError.INVALID_CODE);
    const confirmed: AuthResult = await authClient.confirm(this.email, this.code);
    if (this.destroyed) return;
    if (!confirmed.ok) return this.showError(confirmed.error);
    const login = await useAuthStore.getState().login(this.email, this.password);
    if (this.destroyed) return;
    if (login.ok) return this.onClose();
    // Confirmed from a login attempt we have no password for: ask to log in.
    this.step = AuthStep.LOGIN;
    this.render({ text: t('auth.confirmed'), ok: true });
  }

  private resend(): Promise<void> {
    return this.run(async () => {
      const res = await authClient.resendCode(this.email);
      if (this.destroyed) return;
      if (res.ok) this.show(t('auth.resent'), true);
      else this.showError(res.error);
    });
  }
}
