import { Container } from 'pixi.js';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { IconButton } from '../kit/icon-button';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/action-button-icons';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition, SCORE_ACTION_BG, SCORE_ACTION_BG_ACTIVE } from '../layout';

export class HudAchievements implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;
  private unsub: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['achievements']!,
      size: SKILLS_BUTTON_SIZE,
      color: SCORE_ACTION_BG,
      hoverColor: SCORE_ACTION_BG_ACTIVE,
      pressedColor: SCORE_ACTION_BG_ACTIVE,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'achievements' }),
      iconFactory: makeActionButtonIcon,
    });
    btn.position.set(0, 0);
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.layout();
    this.unsub = useGameStore.subscribe(() => this.layout());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = scoreButtonsPosition(this.host.app.screen.width, this.host.app.screen.height).achievements;
    this.el.position.set(pos.x, pos.y);
  };

  destroy(): void {
    if (this.unsub) this.unsub();
    this.unsub = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
