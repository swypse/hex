import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { rankPlayers } from '../../game/game-mode';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { drawPlayerStatsBlock } from './player-stats-block';

export class GameStats {
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const close = new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) });
    const popup = new Popup({
      app: host.app,
      title: t('stats.title'),
      buttons: [close],
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(popup.el);
    this.popup = popup;
    this.render();
    popup.finish();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.onResize = () => {
      const popup = this.popup;
      if (!popup) return;
      popup.setButtons([new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) })]);
      this.render();
      popup.reflow();
    };
    window.addEventListener('resize', this.onResize);
  }

  private render(): void {
    const popup = this.popup;
    if (!popup || !this.host) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const cw = popup.contentWidth;

    popup.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!map) {
      popup.reflow();
      return;
    }
    const ranked = rankPlayers(s.players, map);
    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    let y = 0;
    ranked.forEach((p, rank) => {
      y = drawPlayerStatsBlock(popup.content, cw, y, rank === 0, { player: p, place: rank + 1, map, known, dimmed: !p.isActive });
    });
    popup.reflow();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.popup?.destroy();
    this.popup = null;
    this.host = null;
  }
}
