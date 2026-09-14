import { Container } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/gameController';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT, TURN_BAR_GAP, isWideScreen, ACTION_TOOLBAR_MAX_WIDTH } from '../layout';

export class HudWatchExit implements Widget {
  private el: Container | null = null;
  private btn: Button | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const btn = new Button({ label: t('watch.exit'), onClick: () => gameController.exitWatching() });
    const el = new Container();
    el.addChild(btn);
    root.addChild(el);
    this.el = el;
    this.btn = btn;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  elVisible(): boolean {
    const s = useGameStore.getState();
    return s.screen === 'game' && s.watching && !s.gameOver;
  }

  private update(): void {
    if (this.el) this.el.visible = this.elVisible();
  }

  private layout = (): void => {
    if (!this.el || !this.btn || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    const barW = isWideScreen(screenW) ? ACTION_TOOLBAR_MAX_WIDTH : screenW;
    this.el.position.set(
      (screenW - barW) / 2 + barW / 2 - this.btn.width / 2,
      screenH - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT - TURN_BAR_GAP - this.btn.height,
    );
  };

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.btn = null;
    this.host = null;
  }
}