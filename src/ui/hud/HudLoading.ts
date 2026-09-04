import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { TOOLBAR_HEIGHT } from '../layout';

export class HudLoading implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const label = makeLabel('Loading...', { fontSize: 26, fill: 0xffffff, fontWeight: '700' });
    label.anchor.set(0.5, 0.5);
    el.addChild(label);
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    this.el.position.set(
      this.host.app.screen.width / 2,
      (this.host.app.screen.height - TOOLBAR_HEIGHT) / 2,
    );
  };

  private update(): void {
    if (!this.el) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === 'game' && s.texturesLoading;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
