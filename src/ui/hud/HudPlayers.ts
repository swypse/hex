import { Container, Graphics } from 'pixi.js';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

export const PLAYER_ONLINE_COLOR = 0x2ecc71;
export const PLAYER_OFFLINE_COLOR = 0xe74c3c;

const RADIUS = 20;
const DOT_RADIUS = 6;
const PAD = 8;
const SLOT_WIDTH = 132;

export class HudPlayers implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
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
    this.el.position.set(PAD, PAD);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === 'game' && s.netMode !== 'single';
    this.el.removeChildren();
    if (!this.el.visible) return;
    let x = 0;
    for (const p of s.players) {
      if (!p.isHuman) continue;
      const online = s.playersOnline[p.index] ?? true;
      const chip = this.makeChip(p.name, p.tribe, online);
      chip.position.set(x, 0);
      this.el.addChild(chip);
      x += SLOT_WIDTH;
    }
  }

  private makeChip(name: string, tribeId: number, online: boolean): Container {
    const tribe = TRIBES.find((t) => t.id === tribeId)!;
    const chip = new Container();
    const cx = SLOT_WIDTH / 2;
    const cy = RADIUS + 4;

    const circle = new Graphics();
    circle.circle(0, 0, RADIUS).fill(0xffffff);
    circle.position.set(cx, cy);

    const clip = new Graphics();
    clip.circle(0, 0, RADIUS).fill(0xffffff);
    clip.position.set(cx, cy);

    const icon = makeIcon(`${tribe.code}-icon.png`, RADIUS * 2);
    icon.mask = clip;
    icon.position.set(cx, cy);

    const dot = new Graphics();
    dot.circle(0, 0, DOT_RADIUS).fill(online ? PLAYER_ONLINE_COLOR : PLAYER_OFFLINE_COLOR).stroke({ width: 2, color: 0xffffff });
    dot.position.set(cx + RADIUS - DOT_RADIUS - 2, cy - RADIUS + DOT_RADIUS + 2);

    const nameLabel = makeLabel(name, { fontSize: 12, fill: 0xffffff, fontWeight: '700' });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(cx, cy + RADIUS + 6);

    const tribeLabel = makeLabel(tribe.name, { fontSize: 10, fill: 0xbbbbbb });
    tribeLabel.anchor.set(0.5, 0);
    tribeLabel.position.set(cx, cy + RADIUS + 22);

    chip.addChild(circle, clip, icon, dot, nameLabel, tribeLabel);
    return chip;
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
