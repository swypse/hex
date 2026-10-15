import { Container } from 'pixi.js';
import { useAuthStore } from '../auth/auth-store';
import { markDirty } from '../gfx/render-gate';
import { makeLabel } from '../gfx/label';
import { t } from '../i18n';
import { Button } from './kit/button';
import { AuthStatus, ButtonStyle, FontSize } from '@enums';

const GAP = 8;
const NAME_MAX_WIDTH = 160;

/** Top-right account controls: Log in / Register, or the user's name + Log out. */
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
    const textOnly = { fontSize: FontSize.SMALL, style: ButtonStyle.TEXT };
    const items: Container[] = [];
    if (status === AuthStatus.AUTHENTICATED && user) {
      const name = makeLabel(user.name, { fontSize: FontSize.SMALL, fill: 0xffffff });
      if (name.width > NAME_MAX_WIDTH) name.scale.set(NAME_MAX_WIDTH / name.width);
      items.push(name, new Button({ ...textOnly, label: t('auth.logout'), onClick: () => void useAuthStore.getState().logout() }));
    } else if (status === AuthStatus.UNKNOWN) {
      items.push(makeLabel(t('auth.loading'), { fontSize: FontSize.SMALL, fill: 0xeeeeee }));
    } else if (status === AuthStatus.ANONYMOUS) {
      items.push(
        new Button({ ...textOnly, label: t('auth.login'), onClick: this.onLogin }),
        new Button({ ...textOnly, label: t('auth.register'), onClick: this.onRegister }),
      );
    }
    const height = Math.max(...items.map((i) => i.height));
    let x = 0;
    for (const item of items) {
      item.position.set(x, (height - item.height) / 2);
      x += item.width + GAP;
      this.addChild(item);
    }
  }

  override destroy(): void {
    this.unsubscribe();
    super.destroy({ children: true });
  }
}
