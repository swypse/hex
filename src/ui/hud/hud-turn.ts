import { Container, Graphics, BitmapText } from 'pixi.js';

import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { t } from '../../i18n';
import { TURN_BAR_HEIGHT, TURN_BAR_COLOR } from '../layout';

export class HudTurn implements Widget {
  private el: Container | null = null;
  private text: BitmapText | null = null;
  private panel: Graphics | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const panel = new Graphics();
    const fontSize = 13;
    const text = makeLabel('', { fontSize, fill: 0xffffff });
    text.anchor.set(0.5, 0.5);
    el.addChild(panel, text);
    root.addChild(el);
    this.el = el;
    this.panel = panel;
    this.text = text;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    this.el.position.set(0, this.host.app.screen.height - TURN_BAR_HEIGHT);
  };

  private update(): void {
    if (!this.el || !this.text || !this.panel || !this.host) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === 'game';
    let base = s.tutorial ? t('hud.turn.tutorial', { turn: s.turn }) : t('hud.turn.mode', {
      mode: t(s.mode === 'capture' ? 'mode.capture' : 'mode.turns30'),
      turn: s.turn
    });
    let label = base;
    const current = s.players[s.currentPlayerIndex];
    if (s.aiActive && current) {
      const tribe = tribeById(current.tribe);
      if (tribe) {
        const local = s.players[s.localPlayerIndex];
        const known = new Set<number>();
        if (local) {
          known.add(local.tribe);
          for (const t of local.knownTribes ?? []) known.add(t);
        }
        const name = known.has(current.tribe) ? tribe.name : t('ui.unknownTribe');
        label = `${base}${base ? '. ' : ''}${t('hud.waitingTurn', { name })}`;
      }
    }
    this.text.text = label;
    const barW = this.host.app.screen.width;
    this.panel.clear();
    this.panel.rect(0, 0, barW, TURN_BAR_HEIGHT).fill({ color: TURN_BAR_COLOR });
    this.text.position.set(barW / 2, TURN_BAR_HEIGHT / 2);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.panel = null;
    this.host = null;
  }
}
