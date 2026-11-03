import { Container, Graphics, BitmapText } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { totalScore } from '../../game/score';
import { activeBuffs, BUFF_INFO } from '../../game/units/buffs';
import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../../gfx/label';
import { Popup, POPUP_BODY_SIZE } from '../kit/popup';
import {
  SCORE_PAD,
  SCORE_TOP_OFFSET,
  SCORE_CHIP_RADIUS,
  SCORE_TEXT_Y,
  buffRowPosition,
} from './layout';
import { BuffId, FontSize, SkillId } from '@enums';
import { makeSkillMedallion } from '../kit/skill-medallion';

const SCORE_FONT_SIZE = FontSize.BIG;
const SCORE_COLOR = 0xffffff;
const CHIP_RADIUS = SCORE_CHIP_RADIUS;
const PAD = SCORE_PAD;
const TOP_OFFSET = SCORE_TOP_OFFSET;
const ICON_SIZE = 16;
/** Vertical gap between buff items (icon + sub score) under the score circle. */
const BUFF_GAP = 8;
/** Skill medallion in the buff popup, and the gap to the description. */
const MEDALLION_SIZE = 56;
const MEDALLION_GAP = 12;
/** Room around the medallion so its stroke is not clipped by the popup content box. */
const MEDALLION_MARGIN = 6;
/** The skill each protection buff comes from. */
const BUFF_SKILL: Record<BuffId, SkillId> = {
  [BuffId.WATER_PROTECTION]: SkillId.WATER_TEMPLES,
  [BuffId.FOREST_PROTECTION]: SkillId.FOREST_TEMPLE,
};
/** Vertical centre of the score readout: just below the resource panel row. */
const SCORE_BELOW_RESOURCE_Y = SCORE_TEXT_Y;

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
  /** Invisible full-screen catcher behind the buff popup: a tap outside closes it. */
  private buffCatcher: Graphics | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const text = makeLabel('0', {
      fontSize: SCORE_FONT_SIZE,
      fill: SCORE_COLOR,
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
    // Paint the current score into the initial "0" label — update() short-
    // circuits when the score is unchanged, so without this the chip would
    // display 0 until the score next changed.
    const initial = this.readScore();
    this.lastScore = initial;
    text.text = t('stats.pts', { score: initial });
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
    // The tribe chip stays top-right; the score readout moves below the
    // resource panel, centred horizontally, as "N pts" white regular text.
    const chipX = this.host.app.screen.width - PAD - CHIP_RADIUS;
    const chipY = PAD + TOP_OFFSET + CHIP_RADIUS;
    this.tribeChip.position.set(chipX, chipY);
    this.text.position.set(this.host.app.screen.width / 2, SCORE_BELOW_RESOURCE_Y);
    this.el.position.set(0, 0);
    const buff = buffRowPosition(this.host.app.screen.width, this.host.app.screen.height);
    this.buffRow.position.set(buff.x, buff.y);
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
    this.text.text = t('stats.pts', { score });
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
      item.on('pointertap', (e?: { stopPropagation(): void }) => {
        // Only the buff popup opens, not whatever the score area itself does on tap.
        e?.stopPropagation();
        this.openBuffPopup(buff);
      });
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
    // The skill that grants the buff, as its medallion beside the description.
    const medallion = makeSkillMedallion({ skill: BUFF_SKILL[buff], opened: true, size: MEDALLION_SIZE, app: this.host.app });
    medallion.position.set(MEDALLION_MARGIN + MEDALLION_SIZE / 2, MEDALLION_MARGIN + MEDALLION_SIZE / 2);
    const desc = makeLabel(info.description, {
      fontSize: POPUP_BODY_SIZE,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth - MEDALLION_SIZE - MEDALLION_MARGIN * 2 - MEDALLION_GAP,
    });
    desc.position.set(MEDALLION_SIZE + MEDALLION_MARGIN * 2 + MEDALLION_GAP, MEDALLION_MARGIN);
    popup.content.addChild(medallion, desc);
    // Must render in the overlay layer (above the map and HUD), not on the
    // stage — stage children sit below screen/overlay layers by default.
    const catcher = new Graphics();
    catcher.rect(0, 0, this.host.app.screen.width, this.host.app.screen.height).fill({ color: 0x000000, alpha: 0 });
    catcher.eventMode = 'static';
    catcher.on('pointertap', onDone);
    this.host.overlayLayer.addChild(catcher, popup.el);
    popup.finish();
    this.buffPopup = popup;
    this.buffCatcher = catcher;
  }

  private closeBuffPopup(): void {
    this.buffPopup?.destroy();
    this.buffPopup = null;
    this.buffCatcher?.destroy();
    this.buffCatcher = null;
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
