import { Container, Graphics, BitmapText } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { totalScore } from '../../game/score';
import { activeBuffs, BUFF_INFO, type BuffId } from '../../game/buffs';
import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Popup, POPUP_BODY_SIZE } from '../kit/popup';
import {
  SCORE_PAD,
  SCORE_TOP_OFFSET,
  SCORE_CHIP_RADIUS,
  SCORE_TEXT_CHIP_GAP,
  SCORE_TEXT_HEIGHT,
  SCORE_BUFF_CHIP_GAP,
} from '../layout';

const SCORE_FONT_SIZE = 16;
const SCORE_COLOR = 0xffc465;
const CHIP_RADIUS = SCORE_CHIP_RADIUS;
const PAD = SCORE_PAD;
const TOP_OFFSET = SCORE_TOP_OFFSET;
const ICON_SIZE = 16;
/** Vertical gap between buff items (icon + sub score) under the score circle. */
const BUFF_GAP = 8;

export class HudScore implements Widget {
  /** Optional tap handler (used by the skill-tree screen to open score details). */
  onTap: (() => void) | null = null;
  private el: Container | null = null;
  private text: BitmapText | null = null;
  private tribeChip: Container | null = null;
  private buffRow: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private lastScore = 0;
  private buffPopup: Popup | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const text = makeLabel('0', {
      fontSize: SCORE_FONT_SIZE,
      fill: SCORE_COLOR,
      fontWeight: '700',
    });
    text.anchor.set(0.5, 0.5);

    // The local player's tribe logo clipped into a white circle chip.
    const s = useGameStore.getState();
    const localPlayer = s.players[s.localPlayerIndex];
    const tribe = localPlayer ? tribeById(localPlayer.tribe) : undefined;
    const tribeChip = this.makeTribeChip(tribe?.code);

    const buffRow = new Container();
    el.addChild(text, tribeChip, buffRow);
    if (this.onTap) {
      el.eventMode = 'static';
      el.cursor = 'pointer';
      el.on('pointertap', () => this.onTap?.());
    }
    root.addChild(el);
    this.el = el;
    this.text = text;
    this.tribeChip = tribeChip;
    this.buffRow = buffRow;
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

  private makeTribeChip(code: string | undefined): Container {
    const chip = new Container();
    const radius = CHIP_RADIUS;
    const circle = new Graphics();
    circle.circle(0, 0, radius).fill(0xffffff);
    const clip = new Graphics();
    clip.circle(0, 0, radius).fill(0xffffff);
    const icon = makeIcon(`${code ?? '?'}-icon.png`, radius * 2);
    icon.mask = clip;
    chip.addChild(circle, clip, icon);
    return chip;
  }

  private layout = (): void => {
    if (!this.el || !this.host || !this.text || !this.tribeChip || !this.buffRow) return;
    // The row hugs the top-right: tribe chip at the right edge, the score text
    // centred below it (6px gap), buff icons centred under the chip.
    const chipX = this.host.app.screen.width - PAD - CHIP_RADIUS;
    const chipY = PAD + TOP_OFFSET + CHIP_RADIUS;
    this.tribeChip.position.set(chipX, chipY);
    this.text.position.set(chipX, chipY + CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT / 2);
    this.el.position.set(0, 0);
    this.buffRow.position.set(chipX - ICON_SIZE / 2, chipY + CHIP_RADIUS + SCORE_TEXT_CHIP_GAP + SCORE_TEXT_HEIGHT + SCORE_BUFF_CHIP_GAP);
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
  }

  private updateBuffs(): void {
    if (!this.buffRow || !this.host) return;
    for (const child of this.buffRow.children) child.destroy({ children: true });
    this.buffRow.removeChildren();
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const buffs = activeBuffs(map, s.localPlayerIndex);
    let y = 0;
    for (const buff of buffs) {
      const info = BUFF_INFO[buff];
      const item = new Container();
      const icon = makeIcon(info.icon, ICON_SIZE);
      icon.position.set(0, 0);
      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.on('pointertap', () => this.openBuffPopup(buff));
      item.addChild(icon);
      item.position.set(0, y);
      this.buffRow.addChild(item);
      y += ICON_SIZE + BUFF_GAP;
    }
    this.layout();
  }

  /** Opens a small card describing the tapped protection buff: when it appears
   *  and what it gives. */
  private openBuffPopup(buff: BuffId): void {
    if (!this.host) return;
    this.closeBuffPopup();
    const info = BUFF_INFO[buff];
    const onDone = (): void => {
      this.closeBuffPopup();
    };
    const popup = new Popup({
      app: this.host.app,
      title: info.name,
      modal: false,
      width: 300,
      onClose: onDone,
      closeOnEscape: true,
      onTap: onDone,
    });
    const desc = makeLabel(info.description, {
      fontSize: POPUP_BODY_SIZE,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    desc.position.set(0, 0);
    popup.content.addChild(desc);
    this.host.app.stage.addChild(popup.el);
    popup.finish();
    this.buffPopup = popup;
  }

  private closeBuffPopup(): void {
    this.buffPopup?.destroy();
    this.buffPopup = null;
  }

  destroy(): void {
    this.unsub?.();
    window.removeEventListener('resize', this.layout);
    this.closeBuffPopup();
    this.unsub = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.text = null;
    this.tribeChip = null;
    this.buffRow = null;
    this.host = null;
  }
}