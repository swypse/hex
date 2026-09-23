import { t } from '../../i18n';
import { Container, Graphics, BitmapText } from 'pixi.js';
import { placeWord } from '../../i18n/lists';
import { gameController } from '../../controller/game-controller';
import { TRIBES, tribeById } from '../../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { EMPTY_STATS, totalScore } from '../../game/score';
import { achievementIcon } from '../../game/achievements';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIconChip } from '../kit/tribe-chip';
import { makeAchievementChip } from '../kit/achievement-icons';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

const CHIP_SIZE = 32;
const HEADER_LINE = 40;
const ROW_LINE = 18;
const DIVIDER_MARGIN = 6;
/** Achievement medallions shown under the "Achievements" label. */
const ACHIEVEMENT_MEDALLION = 32;
const ACHIEVEMENT_GAP = 6;

export class GameStats {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const close = new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) });
    const popup = new Popup({
      app: host.app,
      title: t('stats.title'),
      buttons: [close],
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    this.render();
    popup.finish();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.onResize = () => {
      const popup = this.popup;
      if (!popup) return;
      popup.setButtons([new Button({ label: t('common.close'), onClick: () => useGameStore.getState().setOverlay(null) })]);
      this.render();
      popup.reflow();
    };
    window.addEventListener('resize', this.onResize);
  }

  private render(): void {
    const popup = this.popup;
    if (!popup || !this.host) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const cw = popup.contentWidth;
    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    popup.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    let y = 0;
    const top = (label: BitmapText, x: number, ty: number): void => {
      label.anchor.set(0, 0);
      label.position.set(x, ty);
      popup.content.addChild(label);
    };

    ranked.forEach(({ p, score }, rank) => {
      const tribe = tribeById(p.tribe);
      const knownTribe = tribe !== undefined && known.has(p.tribe);
      const tribeName = knownTribe ? tribe!.name : t('ui.unknownTribe');

      if (rank > 0) {
        y += DIVIDER_MARGIN;
        const sep = new Graphics();
        sep.rect(0, y, cw, 1).fill({ color: 0xffffff, alpha: 0.12 });
        popup.content.addChild(sep);
        y += 1 + DIVIDER_MARGIN;
      }
      const headerCentre = y + HEADER_LINE / 2;

      // Tribe icon: the tribe's own logo once known, a "?" circle otherwise.
      if (knownTribe) {
        const chip = makeIconChip(`${tribe!.code}-icon.png`, CHIP_SIZE, { bgColor: 0xffffff });
        chip.position.set(CHIP_SIZE / 2, headerCentre);
        popup.content.addChild(chip);
      } else {
        const unknown = new Container();
        const bg = new Graphics();
        bg.circle(0, 0, CHIP_SIZE / 2).fill(UNKNOWN_TRIBE_COLOR);
        const q = makeLabel('?', { fontSize: 20, fill: 0xffffff, fontWeight: '800' });
        q.anchor.set(0.5, 0.5);
        unknown.addChild(bg, q);
        unknown.position.set(CHIP_SIZE / 2, headerCentre);
        popup.content.addChild(unknown);
      }

      const name = makeLabel(tribeName, { fontSize: 15, fill: p.isActive ? 0xffffff : 0x777777, fontWeight: '700' });
      name.anchor.set(0, 0.5);
      name.position.set(CHIP_SIZE + 8, headerCentre);
      popup.content.addChild(name);

      const scoreLabel = makeLabel(t('stats.pts', { score }), { fontSize: 20, fill: 0xff8c00, fontWeight: '900' });
      scoreLabel.anchor.set(1, 0.5);
      scoreLabel.position.set(cw, headerCentre);
      popup.content.addChild(scoreLabel);
      const place = makeLabel(placeWord(rank + 1), { fontSize: 13, fill: 0xcccccc, fontWeight: '600' });
      place.anchor.set(1, 0.5);
      place.position.set(cw - scoreLabel.width - 8, headerCentre);
      popup.content.addChild(place);

      y += HEADER_LINE;

      const stats = p.stats ?? EMPTY_STATS;
      const rows: { label: string; value: string }[] = [
        { label: t('stats.detailKills'), value: String(p.kills) },
        { label: t('stats.detailTribes'), value: String(stats.tribesEliminated ?? 0) },
        { label: t('stats.detailSkills'), value: String(p.skills.length) },
      ];
      const mid = cw / 2;
      for (const row of rows) {
        const centre = y + ROW_LINE / 2;
        const title = makeLabel(row.label, { fontSize: 13, fill: 0xaaaaaa });
        title.anchor.set(0, 0.5);
        title.position.set(0, centre);
        popup.content.addChild(title);
        const value = makeLabel(row.value, { fontSize: 13, fill: 0xffffff });
        value.anchor.set(0, 0.5);
        value.position.set(mid, centre);
        popup.content.addChild(value);
        y += ROW_LINE;
      }

      const achievementIds = p.achievements ?? [];
      if (achievementIds.length > 0) {
        y += 6;
        const title = makeLabel(t('stats.detailAchievements'), { fontSize: 13, fill: 0xaaaaaa });
        top(title, 0, y);
        y += title.height + 6;
        // The achievement value is a row of circular medallions under the label.
        let x = 0;
        for (const id of achievementIds) {
          const medallion = makeAchievementChip(achievementIcon(id), ACHIEVEMENT_MEDALLION);
          medallion.position.set(x, y);
          popup.content.addChild(medallion);
          x += ACHIEVEMENT_MEDALLION + ACHIEVEMENT_GAP;
        }
        y += ACHIEVEMENT_MEDALLION;
      }
    });
    popup.reflow();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.popup?.destroy();
    this.popup = null;
    this.el = null;
    this.host = null;
  }
}
