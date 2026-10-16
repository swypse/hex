import { Container, Graphics } from 'pixi.js';
import { useAuthStore } from '../auth/auth-store';
import { markDirty } from '../gfx/render-gate';
import { makeLabel } from '../gfx/label';
import { t } from '../i18n';
import { Button } from './kit/button';
import { AuthStatus, ButtonStyle, FontSize } from '@enums';

const GAP = 8;
const NAME_MAX_WIDTH = 160;
const PILL_PAD = 4;
const ACCENT = 0x5297ff;

/** Top-right account controls: Log in / Register buttons, or a user pill with Log out. */
export class AuthBar extends Container {
  private unsubscribe: () => void;

  constructor(private readonly onLogin: () => void, private readonly onRegister: () => void, private readonly onChange: () => void) {
    super();
    this.unsubscribe = useAuthStore.subscribe(() => {
      this.rebuild();
      this.onChange();
      markDirty();
    });
    this.rebuild();
    void useAuthStore.getState().restore();
  }

  private rebuild(): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { status, user } = useAuthStore.getState();
    const small = { fontSize: FontSize.SMALL, shadow: false, paddingX: 14, paddingY: 6 };
    if (status === AuthStatus.AUTHENTICATED && user) {
      this.buildUser(user.name, new Button({ ...small, style: ButtonStyle.POPUP_OUTLINE, label: t('auth.logout'), onClick: () => void useAuthStore.getState().logout() }));
    } else if (status === AuthStatus.ANONYMOUS) {
      const login = new Button({ ...small, style: ButtonStyle.POPUP_OUTLINE, label: t('auth.login'), onClick: this.onLogin });
      const register = new Button({ ...small, style: ButtonStyle.POPUP, label: t('auth.register'), onClick: this.onRegister });
      register.x = login.width + GAP;
      this.addChild(login, register);
    } else if (status === AuthStatus.UNKNOWN) {
      this.addChild(makeLabel(t('auth.loading'), { fontSize: FontSize.SMALL, fill: 0xeeeeee }));
    }
  }

  /** Rounded pill: avatar with the name's initial, the name, then the action button. */
  private buildUser(name: string, action: Button): void {
    const h = action.height + PILL_PAD * 2;
    const avatarR = h / 2 - PILL_PAD;
    const initial = makeLabel([...name][0]?.toUpperCase() ?? '?', { fontSize: FontSize.SMALL, fill: 0xffffff });
    const label = makeLabel(name, { fontSize: FontSize.SMALL, fill: 0xffffff });
    if (label.width > NAME_MAX_WIDTH) label.scale.set(NAME_MAX_WIDTH / label.width);
    const bg = new Graphics();
    const avatar = new Graphics().circle(0, 0, avatarR).fill(ACCENT);
    avatar.position.set(PILL_PAD + avatarR, h / 2);
    initial.anchor.set(0.5);
    initial.position.copyFrom(avatar.position);
    label.position.set(PILL_PAD + avatarR * 2 + GAP, (h - label.height) / 2);
    action.position.set(label.x + label.width + GAP * 2, PILL_PAD);
    const w = action.x + action.width + PILL_PAD;
    bg.roundRect(0, 0, w, h, h / 2).fill({ color: 0x000000, alpha: 0.35 }).stroke({ color: 0xffffff, alpha: 0.2, width: 1 });
    this.addChild(bg, avatar, initial, label, action);
  }

  override destroy(): void {
    this.unsubscribe();
    super.destroy({ children: true });
  }
}
