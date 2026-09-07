import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { ACHIEVEMENTS, type AchievementInfo } from '../../game/achievements';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { makeIconChip } from '../kit/tribeChip';
import { Popup } from '../kit/popup';

const ROW_ICON = 64;
const ICON_LABEL_GAP = 18;
const ROW_GAP = 18;
const DETAIL_ICON = 64;
const DETAIL_GAP = 14;
const OPENED_BORDER_COLOR = 0xff8c00;
const OPENED_BORDER_WIDTH = 4;
const CHIP_BG = 0x373748;

export class AchievementsDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private detail: Popup | null = null;
  private host: UIHost | null = null;
  private root: Container | null = null;

  private close(): void {
    useGameStore.getState().setOverlay(null);
  }

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.root = root;
    const s = useGameStore.getState();
    const local = s.players[s.localPlayerIndex];
    if (!local) {
      this.close();
      return;
    }
    const opened = new Set(local.achievements ?? []);

    const close = new Button({ label: t('common.close'), onClick: () => this.close() });
    const popup = new Popup({
      app: host.app,
      title: t('ach.dialog-title'),
      buttons: [close],
      onClose: () => this.close(),
    });
    const cw = popup.contentWidth;
    const listW = cw - OPENED_BORDER_WIDTH * 2;
    const labelW = Math.max(120, listW - ROW_ICON - ICON_LABEL_GAP - 70);

    const list = new Container();
    let y = 0;
    const ordered = [
      ...ACHIEVEMENTS.filter((a) => opened.has(a.id)),
      ...ACHIEVEMENTS.filter((a) => !opened.has(a.id)),
    ];
    for (const a of ordered) {
      const row = new Container();
      const chip = makeIconChip(a.icon, ROW_ICON, {
        bgColor: CHIP_BG,
        border: opened.has(a.id) ? { width: OPENED_BORDER_WIDTH, color: OPENED_BORDER_COLOR } : undefined,
      });
      const name = makeLabel(t(a.nameKey), {
        fontSize: 14,
        fill: opened.has(a.id) ? 0xffffff : 0x999999,
        wordWrap: true,
        wordWrapWidth: labelW,
      });
      const rowH = Math.max(ROW_ICON, name.height);
      name.position.set(ROW_ICON + ICON_LABEL_GAP, (rowH - name.height) / 2);
      chip.position.set(ROW_ICON / 2, rowH / 2);
      const score = makeLabel(`+${a.points}`, {
        fontSize: 14,
        fill: opened.has(a.id) ? 0xffd700 : 0x777777,
        fontWeight: '700',
      });
      score.anchor.set(1, 0.5);
      score.position.set(listW, rowH / 2);
      row.addChild(chip, name, score);
      row.eventMode = 'static';
      row.cursor = 'pointer';
      row.on('pointertap', () => this.openDetail(a));
      row.position.set(0, y);
      list.addChild(row);
      y += rowH + ROW_GAP;
    }
    list.position.set(OPENED_BORDER_WIDTH, OPENED_BORDER_WIDTH);
    popup.content.addChild(list);

    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    popup.finish();
  }

  private openDetail(a: AchievementInfo): void {
    if (!this.host || !this.root) return;
    this.closeDetail();
    const local = useGameStore.getState().players[useGameStore.getState().localPlayerIndex];
    const opened = new Set(local?.achievements ?? []);
    const close = new Button({ label: t('common.close'), onClick: () => this.closeDetail() });
    const popup = new Popup({
      app: this.host.app,
      title: t(a.nameKey),
      buttons: [close],
      width: 360,
      onClose: () => this.closeDetail(),
    });
    const cw = popup.contentWidth;
    const chip = makeIconChip(a.icon, DETAIL_ICON, {
      bgColor: CHIP_BG,
      border: opened.has(a.id) ? { width: OPENED_BORDER_WIDTH, color: OPENED_BORDER_COLOR } : undefined,
    });
    chip.position.set(cw / 2, DETAIL_ICON / 2);
    popup.content.addChild(chip);
    const desc = makeLabel(t(a.descKey), {
      fontSize: 14,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: cw,
    });
    desc.position.set(0, DETAIL_ICON + DETAIL_GAP);
    popup.content.addChild(desc);
    const score = makeLabel(t('ach.scoreLine', { points: a.points }), {
      fontSize: 14,
      fill: 0xffd700,
      fontWeight: '700',
      wordWrap: true,
      wordWrapWidth: cw,
    });
    score.position.set(0, DETAIL_ICON + DETAIL_GAP + desc.height + 10);
    popup.content.addChild(score);
    this.root.addChild(popup.el);
    this.detail = popup;
    popup.finish();
  }

  private closeDetail(): void {
    this.detail?.destroy();
    this.detail = null;
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.closeDetail();
    this.popup?.destroy();
    this.popup = null;
    this.el = null;
    this.root = null;
    this.host = null;
  }
}
