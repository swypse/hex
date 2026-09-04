import { Container, Graphics, Text } from 'pixi.js';
import { GAME_MODE_NAMES } from '../../game/gameMode';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../layout';

const BLOCK_COLOR = 0x5198ff;

export class HudTurn implements Widget {
  private el: Container | null = null;
  private text: Text | null = null;
  private panel: Graphics | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const panel = new Graphics();
    const text = makeLabel('', { fontSize: 13, fill: 0xffffff, fontWeight: '700' });
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
    this.el.position.set(0, this.host.app.screen.height - TOOLBAR_HEIGHT - TURN_BAR_HEIGHT);
  };

  private update(): void {
    if (!this.el || !this.text || !this.panel || !this.host) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === 'game';
    let label = s.tutorial ? `Tutorial. Turn ${s.turn}` : `${GAME_MODE_NAMES[s.mode]}. Turn ${s.turn}`;
    const current = s.players[s.currentPlayerIndex];
    if (s.aiActive && current) {
      const tribe = TRIBES.find((t) => t.id === current.tribe);
      if (tribe) {
        const local = s.players[s.localPlayerIndex];
        const known = new Set<number>();
        if (local) {
          known.add(local.tribe);
          for (const t of local.knownTribes ?? []) known.add(t);
        }
        const name = known.has(current.tribe) ? tribe.name : 'Unknown tribe';
        label += `. Waiting for ${name} turn...`;
      }
    }
    this.text.text = label;
    this.panel.clear().rect(0, 0, this.host.app.screen.width, TURN_BAR_HEIGHT).fill({ color: BLOCK_COLOR });
    this.text.position.set(this.host.app.screen.width / 2, TURN_BAR_HEIGHT / 2);
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
