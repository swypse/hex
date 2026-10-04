import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { tribeById } from '../../game/tribes';
import { totalScore } from '../../game/score';
import { quickCaptureScore, quickCaptureTurnsCount, rankPlayers, starRating } from '../../game/game-mode';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeActionButtonIcon } from '../kit/action-button-icons';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';
import { drawPlayerStatsBlock, placeColor } from './player-stats-block';
import { FontSize, GameMode, Screen } from '@enums';

export { placeColor };

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

    const again = new Button({ label: t('ui.playagain'), width: 180, onClick: () => useGameStore.getState().setScreen(Screen.SETUP) });
    const menu = new Button({ label: t('ui.mainmenu'), width: 180, onClick: () => useGameStore.getState().setScreen(Screen.START) });
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
      fontSize: FontSize.BIG,
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

    const mode = makeLabel(t('gameover.modeTurns', { mode: t(s.mode === GameMode.CAPTURE ? 'mode.capture' : 'mode.turns30'), turns: s.turn }), {
      fontSize: FontSize.SMALL,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: cw,
    });
    mode.anchor.set(0.5, 0);
    mode.position.set(cw / 2, y);
    content.addChild(mode);
    y += mode.height + 14;

    if (s.mode === GameMode.CAPTURE) {
      const quick = makeLabel(t('gameover.quickCapture', { turns: quickCaptureTurnsCount(s.players.length) }), {
        fontSize: FontSize.SMALL,
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
      const fastBonus =
        p.index === s.winnerIndex && s.mode === GameMode.CAPTURE && s.turn <= quickCaptureTurnsCount(s.players.length)
          ? quickCaptureScore(s.players.length)
          : 0;
      y = drawPlayerStatsBlock(content, cw, y, rank === 0, { player: p, place: rank + 1, map, known, fastBonus });
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
