import { Container, Graphics } from 'pixi.js';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { TRIBES } from '../../game/tribes';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { makeIconChip } from '../kit/tribeChip';

const CIRCLE_SIZE = 36;
const RADIUS = CIRCLE_SIZE / 2;
const GAP = 8;
/** Vertical centre of the chip row, just below the top-centre resource panel. */
const ROW_Y = 52;
const ELIMINATED_ALPHA = 0.3;

export class HudTribes implements Widget {
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
    this.el.position.set(this.host.app.screen.width / 2, ROW_Y);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const local = s.players[s.localPlayerIndex];
    this.el.removeChildren();
    if (s.screen !== 'game' || !local) {
      this.el.visible = false;
      return;
    }
    const known = new Set<number>([local.tribe, ...(local.knownTribes ?? [])]);
    const enemies = s.players.filter((p) => p.index !== local.index);
    this.el.visible = enemies.length > 0;
    let x = -(((enemies.length - 1) * (CIRCLE_SIZE + GAP)) / 2);
    for (const p of enemies) {
      const chip = this.makeChip(p.tribe, known.has(p.tribe), p.isActive);
      chip.position.set(x, 0);
      this.el.addChild(chip);
      x += CIRCLE_SIZE + GAP;
    }
  }

  private makeChip(tribeId: number, explored: boolean, active: boolean): Container {
    if (explored) {
      const tribe = TRIBES.find((t) => t.id === tribeId);
      if (!tribe) return new Container();
      const chip = makeIconChip(`${tribe.code}-icon.png`, CIRCLE_SIZE);
      chip.alpha = active ? 1 : ELIMINATED_ALPHA;
      return chip;
    }
    const chip = new Container();
    const bg = new Graphics();
    bg.circle(0, 0, RADIUS).fill(UNKNOWN_TRIBE_COLOR);
    const question = makeLabel('?', { fontSize: 22, fill: 0xffffff, fontWeight: '800' });
    question.anchor.set(0.5, 0.5);
    chip.addChild(bg, question);
    chip.alpha = active ? 1 : ELIMINATED_ALPHA;
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
