import { Circle, Container, Graphics, Rectangle } from 'pixi.js';
import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition } from '../layout';

export const PLAYER_ONLINE_COLOR = 0x2ecc71;
export const PLAYER_OFFLINE_COLOR = 0xe74c3c;

const PAD = 8;
const GAP = 6;
const SIZE = SKILLS_BUTTON_SIZE;
const DOT_RADIUS = 6;
const READOUT_PAD_X = 8;
const READOUT_PAD_Y = 6;
const READOUT_RADIUS = 6;
const READOUT_BG = { color: 0x000000, alpha: 0.8 };
const READOUT_FONT_SIZE = 16;

/** Compact online-players row: one 40px tribe circle per human player, aligned
 *  with the achievements button (top-right column) but on the left edge. The
 *  player name and tribe show only while the circle is hovered / focused /
 *  pressed, as white 16px text inside a black container to the right. */
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
    const w = this.host.app.screen.width;
    const h = this.host.app.screen.height;
    const y = scoreButtonsPosition(w, h).achievements.y;
    this.el.position.set(PAD, y);
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
      x += SIZE + GAP;
    }
  }

  private makeChip(name: string, tribeId: number, online: boolean): Container {
    const tribe = tribeById(tribeId)!;
    const chip = new Container();
    const r = SIZE / 2;

    const circle = new Graphics();
    circle.circle(0, 0, r).fill(0xffffff);
    circle.position.set(r, r);

    const clip = new Graphics();
    clip.circle(0, 0, r).fill(0xffffff);
    clip.position.set(r, r);

    const icon = makeIcon(`${tribe.code}-icon.png`, SIZE);
    icon.mask = clip;
    icon.position.set(r, r);

    const dot = new Graphics();
    dot.circle(0, 0, DOT_RADIUS).fill(online ? PLAYER_ONLINE_COLOR : PLAYER_OFFLINE_COLOR).stroke({ width: 2, color: 0xffffff });
    dot.position.set(r + r - DOT_RADIUS - 2, r - r + DOT_RADIUS + 2);

    const readout = this.makeReadout(`${name} — ${tribe.name}`);
    const show = (): void => {
      readout.visible = true;
    };
    const hide = (): void => {
      readout.visible = false;
    };

    chip.addChild(circle, clip, icon, dot, readout);
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.hitArea = new Circle(r, r, r + 2);
    chip.on('pointerover', show);
    chip.on('pointerout', hide);
    chip.on('pointerdown', show);
    chip.on('pointerupoutside', hide);
    chip.on('focusin', show);
    chip.on('focusout', hide);
    readout.on('pointerover', show);
    readout.on('pointerout', hide);
    return chip;
  }

  private makeReadout(text: string): Container {
    const label = makeLabel(text, { fontSize: READOUT_FONT_SIZE, fill: 0xffffff });
    const boxW = label.width + READOUT_PAD_X * 2;
    const boxH = label.height + READOUT_PAD_Y * 2;
    const readout = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, boxW, boxH, READOUT_RADIUS).fill(READOUT_BG);
    label.position.set(READOUT_PAD_X, READOUT_PAD_Y);
    readout.addChild(bg, label);
    readout.position.set(SIZE + GAP, 0);
    readout.eventMode = 'static';
    readout.hitArea = new Rectangle(SIZE + GAP, 0, boxW, boxH);
    readout.visible = false;
    return readout;
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