import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { totalScore } from '../../game/score';
import { activeBuffs, BUFF_INFO } from '../../game/buffs';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Tooltip } from '../kit/tooltip';
import { tooltipsEnabled } from '../kit/tooltipGate';

const SIZE = 64;
const PAD = 8;
const ICON_SIZE = 16;
const BUFF_GAP = 4;

export class HudScore implements Widget {
  private el: Container | null = null;
  private text: Text | null = null;
  private buffRow: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private lastScore = 0;
  private tooltip: Tooltip | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const size = SIZE;
    const pad = PAD;
    const bg = new Graphics();
    bg.circle(0, 0, size / 2).fill(0xffc465).stroke({ width: 4, color: 0xffe8b5 });
    const text = makeLabel('0', { fontSize: 24, fill: 0x1a1a2e, fontWeight: '800' });
    text.anchor.set(0.5, 0.5);
    const buffRow = new Container();
    el.addChild(bg, text, buffRow);
    root.addChild(el);
    this.el = el;
    this.text = text;
    this.buffRow = buffRow;
    this.tooltip = new Tooltip(host.app);
    host.app.stage.addChild(this.tooltip.el);
    this.lastScore = this.readScore();
    this.layout();
    window.addEventListener('resize', this.layout);
    this.unsub = useGameStore.subscribe(() => {
      this.update();
      this.updateBuffs();
    });
    this.update();
    this.updateBuffs();
  }

  private layout = (): void => {
    if (!this.el || !this.host || !this.buffRow) return;
    const centerX = this.host.app.screen.width - PAD - SIZE / 2;
    const centerY = PAD + SIZE / 2 + 20;
    this.el.position.set(centerX, centerY);
    const n = this.buffRow.children.length;
    const totalW = n * ICON_SIZE + Math.max(0, n - 1) * BUFF_GAP;
    this.buffRow.position.set(-totalW / 2, SIZE / 2 + 6);
  };

  private readScore(): number {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const human = s.players[s.localPlayerIndex];
    if (!human) return 0;
    return map ? totalScore(map, human) : human.score;
  }

  private update(): void {
    if (!this.text || !this.el) return;
    const score = this.readScore();
    if (score === this.lastScore) return;
    this.lastScore = score;
    this.text.text = String(score);
    this.bounce();
  }

  private updateBuffs(): void {
    if (!this.buffRow || !this.host) return;
    this.buffRow.removeChildren();
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const buffs = activeBuffs(map, s.localPlayerIndex);
    let x = 0;
    for (const buff of buffs) {
      const info = BUFF_INFO[buff];
      const icon = makeIcon(info.icon, ICON_SIZE);
      icon.position.set(x, 0);
      icon.eventMode = 'static';
      if (tooltipsEnabled()) {
        icon.on('pointerover', () => this.tooltip!.showForAfter(icon, info.tooltip, '', 500));
        icon.on('pointerout', () => this.tooltip!.hideAfter(500));
        icon.on('pointerdown', () => this.tooltip!.showFor(icon, info.tooltip, ''));
      }
      this.buffRow.addChild(icon);
      x += ICON_SIZE + BUFF_GAP;
    }
    this.layout();
  }

  private bounce(): void {
    if (!this.host || !this.el) return;
    const start = performance.now();
    const fn = (): void => {
      const t = Math.min(1, (performance.now() - start) / 300);
      const s = 1 + 0.2 * Math.sin(t * Math.PI);
      this.el!.scale.set(s, s);
      if (t >= 1) {
        this.el!.scale.set(1, 1);
        this.host!.app.ticker.remove(fn);
      }
    };
    this.host.app.ticker.add(fn);
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    window.removeEventListener('resize', this.layout);
    this.tooltip?.destroy();
    this.tooltip = null;
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.buffRow = null;
    this.host = null;
  }
}
