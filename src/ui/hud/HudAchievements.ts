import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { IconButton } from '../kit/iconButton';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
import { SKILLS_BUTTON_SIZE, achievementsButtonPosition } from '../layout';

export class HudAchievements implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['achievements']!,
      size: SKILLS_BUTTON_SIZE,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'achievements' }),
      iconFactory: makeActionButtonIcon,
    });
    btn.position.set(0, 0);
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.layout();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = achievementsButtonPosition(this.host.app.screen.width, this.host.app.screen.height);
    this.el.position.set(pos.x, pos.y);
  };

  destroy(): void {
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
