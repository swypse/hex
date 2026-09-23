import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { tribeById } from '../../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { gameOverRows, totalScore } from '../../game/score';
import { quickCaptureScore, quickCaptureTurnsCount, rankPlayers, starRating } from '../../game/game-mode';
import { achievementNameKey, achievementTotalScore, unlockedAchievements } from '../../game/achievements';
import { placeWord } from '../../i18n/lists';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeActionButtonIcon } from '../kit/action-button-icons';
import { makeIconChip } from '../kit/tribe-chip';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export function placeColor(place: number): number {
  if (place === 1) return 0xffd700;
  if (place === 2) return 0xc0c0c0;
  if (place === 3) return 0xcd7f32;
  return 0x888888;
}

const CHIP_SIZE = 32;
const HEADER_LINE = 40;
const ROW_LINE = 18;
const ROW_GAP = 6;
const BLOCK_GAP = 14;
const STAR_SIZE = 64;
const STAR_GAP = 12;
const STAR_MARGIN = 6;
const STAR_DELAY_STEP = 160;
const STAR_BOUNCE_MS = 380;

export class GameOver {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private disposed = false;
  private tickerFns: Array<(t: { deltaMS: number }) => void> = [];

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.winnerIndex === null) return;
    const map = gameController.getMap();
    if (!map) return;
    const winner = s.players[s.winnerIndex];
    if (!winner) return;
    const tribe = tribeById(winner.tribe)!;

    const again = new Button({ label: t('ui.playagain'), width: 180, onClick: () => useGameStore.getState().setScreen('setup') });
    const menu = new Button({ label: t('ui.mainmenu'), width: 180, onClick: () => useGameStore.getState().setScreen('start') });
    const popup = new Popup({
      app: host.app,
      title: t('gameover.title'),
      buttons: [again, menu],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const content = popup.content;
    const cw = popup.contentWidth;

    const ranked = rankPlayers(s.players, map);

    let y = 0;
    const banner = makeLabel(t('gameover.wins', { name: winner.name, tribe: tribe.name }), {
      fontSize: 24,
      fill: tribe.color,
      fontWeight: '800',
      wordWrap: true,
      wordWrapWidth: cw,
    });
    banner.anchor.set(0.5, 0);
    banner.position.set(cw / 2, y);
    content.addChild(banner);
    y += banner.height + 10;

    const rating = starRating(totalScore(map, winner), s.players.length, s.mode, s.turn);
    const starRow = new Container();
    for (let i = 0; i < 3; i++) {
      const filled = i < rating;
      const star = makeActionButtonIcon(filled ? 'action-star' : 'action-star-empty', STAR_SIZE);
      star.label = filled ? 'action-star' : 'action-star-empty';
      // The sprite keeps its STAR_SIZE scale (so it renders at exactly 32px);
      // the wrapper carries the bounce-in animation so the sprite's size is
      // never distorted by the scale tween.
      const wrap = new Container();
      wrap.addChild(star);
      wrap.position.set((i - 1) * (STAR_SIZE + STAR_GAP), 0);
      starRow.addChild(wrap);
    }
    starRow.position.set(cw / 2, y + STAR_MARGIN + STAR_SIZE / 2);
    content.addChild(starRow);
    y += STAR_SIZE + STAR_MARGIN * 2;

    const mode = makeLabel(t('gameover.modeTurns', { mode: t(s.mode === 'capture' ? 'mode.capture' : 'mode.turns30'), turns: s.turn }), {
      fontSize: 14,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: cw,
    });
    mode.anchor.set(0.5, 0);
    mode.position.set(cw / 2, y);
    content.addChild(mode);
    y += mode.height + 14;

    if (s.mode === 'capture') {
      const quick = makeLabel(t('gameover.quickCapture', { turns: quickCaptureTurnsCount(s.players.length) }), {
        fontSize: 14,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: cw,
      });
      quick.anchor.set(0.5, 0);
      quick.position.set(cw / 2, y);
      content.addChild(quick);
      y += quick.height + 14;
    }

    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);

    ranked.forEach((p, rank) => {
      const place = rank + 1;
      const pTribe = tribeById(p.tribe);
      const knownTribe = pTribe !== undefined && known.has(p.tribe);
      const tribeColor = knownTribe ? pTribe!.color : UNKNOWN_TRIBE_COLOR;
      const tribeName = knownTribe ? pTribe!.name : t('ui.unknownTribe');

      if (rank > 0) {
        const sep = new Graphics();
        sep.rect(0, y, cw, 1).fill({ color: 0xffffff, alpha: 0.12 });
        content.addChild(sep);
        y += BLOCK_GAP;
      }
      const headerCentre = y + HEADER_LINE / 2;

      if (knownTribe) {
        const chip = makeIconChip(`${pTribe!.code}-icon.png`, CHIP_SIZE, { bgColor: 0xffffff });
        chip.position.set(CHIP_SIZE / 2, headerCentre);
        content.addChild(chip);
      } else {
        const unknown = new Container();
        const bg = new Graphics();
        bg.circle(0, 0, CHIP_SIZE / 2).fill(UNKNOWN_TRIBE_COLOR);
        const q = makeLabel('?', { fontSize: 20, fill: 0xffffff, fontWeight: '800' });
        q.anchor.set(0.5, 0.5);
        unknown.addChild(bg, q);
        unknown.position.set(CHIP_SIZE / 2, headerCentre);
        content.addChild(unknown);
      }

      const name = makeLabel(tribeName, { fontSize: 15, fill: tribeColor, fontWeight: '700' });
      name.anchor.set(0, 0.5);
      name.position.set(CHIP_SIZE + 8, headerCentre);
      content.addChild(name);

      const score = totalScore(map, p);
      const scoreLabel = makeLabel(t('stats.pts', { score }), { fontSize: 20, fill: 0xff8c00, fontWeight: '900' });
      scoreLabel.anchor.set(1, 0.5);
      scoreLabel.position.set(cw, headerCentre);
      content.addChild(scoreLabel);
      const placeLabel = makeLabel(placeWord(place), { fontSize: 13, fill: placeColor(place), fontWeight: '600' });
      placeLabel.anchor.set(1, 0.5);
      placeLabel.position.set(cw - scoreLabel.width - 8, headerCentre);
      content.addChild(placeLabel);

      y += HEADER_LINE;

      const fastBonus =
        p.index === s.winnerIndex && s.mode === 'capture' && s.turn <= quickCaptureTurnsCount(s.players.length)
          ? quickCaptureScore(s.players.length)
          : 0;
      const rows = gameOverRows(map, p, fastBonus).filter((row) => row.count !== 0 || row.score !== 0);
      for (const row of rows) {
        const centre = y + ROW_LINE / 2;
        const title = makeLabel(row.label, { fontSize: 13, fill: 0xaaaaaa });
        title.anchor.set(0, 0.5);
        title.position.set(0, centre);
        content.addChild(title);
        const valueText =
          row.count === 0 ? `+${row.score}` : row.score > 0 ? `${row.count} · +${row.score}` : String(row.count);
        const value = makeLabel(valueText, { fontSize: 13, fill: 0xff8c00, fontWeight: '600' });
        value.anchor.set(1, 0.5);
        value.position.set(cw, centre);
        content.addChild(value);
        y += ROW_LINE + ROW_GAP;
      }

      const achievementIds = unlockedAchievements(p);
      if (achievementIds.length > 0) {
        const achTitle = makeLabel(t('stats.detailAchievements'), { fontSize: 13, fill: 0xaaaaaa });
        achTitle.anchor.set(0, 0);
        achTitle.position.set(0, y);
        content.addChild(achTitle);
        const achPts = makeLabel(`+${achievementTotalScore(p)}`, { fontSize: 13, fill: 0xff8c00, fontWeight: '600' });
        achPts.anchor.set(1, 0);
        achPts.position.set(cw, y);
        content.addChild(achPts);
        y += ROW_LINE + ROW_GAP;
        for (const id of achievementIds) {
          const line = makeLabel(t(achievementNameKey(id)), { fontSize: 13, fill: 0xeeeeee });
          line.anchor.set(1, 0);
          line.position.set(cw, y);
          content.addChild(line);
          y += ROW_LINE + ROW_GAP;
        }
      }
    });

    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    popup.finish();
    this.animateStars(starRow);
  }

  /** Appears the header stars one by one, each bouncing in from small and
   *  settling at 100% (the star sprites keep their fixed 32px size). */
  private animateStars(starRow: Container): void {
    const app = this.host?.app;
    const ticker = app?.ticker;
    const wrappers = starRow.children as Container[];
    if (!ticker) {
      for (const wrap of wrappers) wrap.scale.set(1);
      return;
    }
    wrappers.forEach((wrap, i) => {
      wrap.scale.set(0);
      const delay = i * STAR_DELAY_STEP;
      let elapsed = 0;
      const fn = (t: { deltaMS: number }): void => {
        if (this.disposed || wrap.destroyed) {
          ticker.remove(fn);
          return;
        }
        // Cap the per-frame step so a slow first frame can't skip the bounce
        // and snap the star straight to full size.
        elapsed += Math.min(t.deltaMS, 50);
        if (elapsed < delay) return;
        const p = Math.min(1, (elapsed - delay) / STAR_BOUNCE_MS);
        const c1 = 1.70158;
        const c3 = c1 + 1;
        const eased = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
        wrap.scale.set(eased, eased);
        if (p >= 1) {
          wrap.scale.set(1, 1);
          ticker.remove(fn);
        }
      };
      this.tickerFns.push(fn);
      ticker.add(fn);
    });
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.disposed = true;
    if (this.host) for (const fn of this.tickerFns) this.host.app.ticker.remove(fn);
    this.tickerFns = [];
    this.popup?.destroy();
    this.popup = null;
    this.el = null;
    this.host = null;
  }
}
