import { Container } from 'pixi.js';
import { OverlayKind, Screen } from '@enums';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { IconButton } from '../kit/icon-button';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition, SCORE_ACTION_BG, SCORE_ACTION_BG_ACTIVE } from './layout';

/** Help button below the trade button; opens the help dialog. */
export class HudHelp implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;
  private unsub: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const btn = new IconButton({
      icon: 'help-32',
      size: SKILLS_BUTTON_SIZE,
      color: SCORE_ACTION_BG,
      hoverColor: SCORE_ACTION_BG_ACTIVE,
      pressedColor: SCORE_ACTION_BG_ACTIVE,
      onClick: () => useGameStore.getState().setOverlay({ kind: OverlayKind.HELP }),
    });
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private update(): void {
    if (!this.el) return;
    this.el.visible = useGameStore.getState().screen === Screen.GAME;
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = scoreButtonsPosition(this.host.app.screen.width, this.host.app.screen.height).help;
    this.el.position.set(pos.x, pos.y);
  };

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
