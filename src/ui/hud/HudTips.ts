import { Container, Graphics } from 'pixi.js';
import type { Text } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { tipsDisabled } from '../../storage/settings';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { SKILLS_BUTTON_SIZE, skillsButtonPosition } from '../layout';
import { currentTipText, initialTipsProgress, isTipsExhausted, tipsDueTurn, type TipsProgress } from './tips';

const TEXT_SIZE = 12;
const PAD_X = 10;
const PAD_Y = 8;
const CROSS_SIZE = 13;
const CROSS_GAP = 10;
const TIP_GAP = 8;
const WRAP_WIDTH = 240;

export class HudTips implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private bg: Graphics | null = null;
  private text: Text | null = null;
  private cross: Text | null = null;
  private boxW = 0;
  private boxH = 0;
  private progress: TipsProgress = initialTipsProgress();
  private pending: string | null = null;
  private shown: string | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.progress = initialTipsProgress();
    const el = new Container();
    const bg = new Graphics();
    const text = makeLabel('', { fontSize: TEXT_SIZE, fill: 0xffffff, wordWrap: true, wordWrapWidth: WRAP_WIDTH });
    text.anchor.set(0, 0.5);
    const cross = makeLabel('\u2715', { fontSize: CROSS_SIZE, fill: 0xffffff });
    cross.anchor.set(0.5, 0.5);
    cross.eventMode = 'static';
    cross.cursor = 'pointer';
    cross.on('pointertap', this.close);
    el.addChild(bg, text, cross);
    el.visible = false;
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.text = text;
    this.cross = cross;
    this.refresh();
    this.unsub = useGameStore.subscribe(() => this.refresh());
    this.onResize = () => this.refresh();
    window.addEventListener('resize', this.onResize);
  }

  private refresh = (): void => {
    if (!this.el) return;
    const s = useGameStore.getState();
    const hidden =
      s.screen !== 'game' ||
      s.gameOver ||
      s.texturesLoading ||
      s.players.length <= s.localPlayerIndex ||
      tipsDisabled();
    if (hidden) {
      this.el.visible = false;
      this.shown = null;
      return;
    }
    if (this.pending === null) {
      // A new tip is only started at the beginning of the local player's own
      // turn; once shown it stays visible (even across other players' turns)
      // until it is closed.
      if (s.currentPlayerIndex !== s.localPlayerIndex) {
        this.el.visible = false;
        this.shown = null;
        return;
      }
      if (isTipsExhausted(this.progress) || s.turn < tipsDueTurn(this.progress)) {
        this.el.visible = false;
        this.shown = null;
        return;
      }
      // currentTipText is non-null here because the progress is not exhausted.
      this.pending = currentTipText(this.progress)!;
    }
    this.render(this.pending);
  };

  private render(text: string): void {
    if (!this.el || !this.bg || !this.text || !this.cross) return;
    if (this.shown === text && this.el.visible) return;
    this.text.text = text;
    this.boxW = PAD_X + this.text.width + CROSS_GAP + this.cross.width + PAD_X;
    this.boxH = Math.max(this.text.height, this.cross.height) + PAD_Y * 2;
    this.bg.clear().roundRect(0, 0, this.boxW, this.boxH, 6).fill({ color: 0x000000, alpha: 0.92 });
    this.text.position.set(PAD_X, this.boxH / 2);
    this.cross.position.set(PAD_X + this.text.width + CROSS_GAP + this.cross.width / 2, this.boxH / 2);
    this.layout();
    this.el.visible = true;
    this.shown = text;
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = skillsButtonPosition(this.host.app.screen.width, this.host.app.screen.height);
    const x = Math.max(4, pos.x - TIP_GAP - this.boxW);
    const y = pos.y + SKILLS_BUTTON_SIZE / 2 - this.boxH / 2;
    this.el.position.set(x, y);
  };

  private close = (): void => {
    if (!this.el) return;
    this.progress.closedAtTurn = useGameStore.getState().turn;
    this.progress.pointer += 1;
    this.pending = null;
    this.shown = null;
    this.el.visible = false;
  };

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.bg = null;
    this.text = null;
    this.cross = null;
    this.host = null;
  }
}
