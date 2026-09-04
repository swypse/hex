import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { totalScore } from '../../game/score';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class GameStats {
  private el: Container | null = null;
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
    this.el = popup.el;
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
    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    popup.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    const lineGap = 6;
    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    let y = 0;
    ranked.forEach(({ p, score }) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe);
      const knownTribe = tribe !== undefined && known.has(p.tribe);
      const role = p.index === s.localPlayerIndex ? t('stats.you') : p.isHuman ? '' : t('stats.ai');
      const tribeName = knownTribe ? tribe!.name : t('ui.unknownTribe');
      const label = makeLabel(
        `${p.name} (${tribeName})${role}: ${t('stats.scoreKills', { score, kills: p.kills })}`,
        { fontSize: 14, fill: knownTribe ? tribe!.color : UNKNOWN_TRIBE_COLOR, wordWrap: true, wordWrapWidth: popup.contentWidth },
      );
      label.position.set(0, y);
      y += label.height + lineGap;
      popup.content.addChild(label);
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
    this.el = null;
    this.host = null;
  }
}
