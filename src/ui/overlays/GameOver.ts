import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { Player } from '../../game/players';
import { scoreBreakdown, totalScore } from '../../game/score';
import { bonusScoreFor, rankPlayers } from '../../game/gameMode';
import { achievementNameKey, achievementPoints, unlockedAchievements } from '../../game/achievements';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export function placeColor(place: number): number {
  if (place === 1) return 0xffd700;
  if (place === 2) return 0xc0c0c0;
  if (place === 3) return 0xcd7f32;
  return 0x888888;
}

const CIRCLE_R = 28;

interface IconView {
  el: Container;
  circle: Graphics;
  playerIndex: number;
}

export class GameOver {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private selectedIndex = 0;
  private details: Container | null = null;
  private icons: IconView[] = [];

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.winnerIndex === null) return;
    const map = gameController.getMap();
    if (!map) return;
    const winner = s.players[s.winnerIndex];
    if (!winner) return;
    const tribe = TRIBES.find((t) => t.id === winner.tribe)!;

    const again = new Button({ label: t('ui.playagain'), width: 180, onClick: () => useGameStore.getState().setScreen('setup') });
    const menu = new Button({ label: t('ui.mainmenu'), width: 180, onClick: () => useGameStore.getState().setScreen('start') });
    const popup = new Popup({
      app: host.app,
      title: 'Game over',
      buttons: [again, menu],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    const content = popup.content;
    const cw = popup.contentWidth;

    const ranked = rankPlayers(s.players, map);
    const placeOf = new Map(ranked.map((p, i) => [p.index, i + 1]));
    this.selectedIndex = s.localPlayerIndex;

    let y = 0;
    const banner = makeLabel(`${winner.name} (${tribe.name}) wins!`, {
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

    const ordered = [s.players[s.localPlayerIndex], ...ranked.filter((p) => p.index !== s.localPlayerIndex)]
      .filter((p): p is Player => p !== undefined);
    const iconRow = new Container();
    const gap = 72;
    this.icons = [];
    ordered.forEach((p, i) => {
      const place = placeOf.get(p.index)!;
      const view = this.makePlayerIcon(p.index, place, () => {
        this.selectedIndex = p.index;
        this.refresh();
      });
      view.el.position.set(i * gap, 0);
      iconRow.addChild(view.el);
      this.icons.push(view);
    });
    const rowW = (ordered.length - 1) * gap;
    iconRow.position.set(cw / 2 - rowW / 2, y);
    content.addChild(iconRow);
    y += 96;

    this.details = new Container();
    this.details.position.set(0, y);
    content.addChild(this.details);

    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    this.refresh();
    popup.finish();
  }

  private makePlayerIcon(playerIndex: number, place: number, onClick: () => void): IconView {
    const p = useGameStore.getState().players[playerIndex]!;
    const el = new Container();
    const circle = new Graphics();
    circle.circle(0, 0, CIRCLE_R).fill(0xffffff);
    const clip = new Graphics();
    clip.circle(0, 0, CIRCLE_R).fill(0xffffff);
    const tribe = TRIBES.find((t) => t.id === p.tribe)!;
    const icon = makeIcon(`${tribe.code}-icon.png`, CIRCLE_R * 2);
    icon.mask = clip;
    const badge = new Graphics();
    badge.circle(0, CIRCLE_R - 10, 11).fill(placeColor(place)).stroke({ width: 2, color: 0xffffff });
    const badgeText = makeLabel(String(place), { fontSize: 13, fill: 0x1a1a2e, fontWeight: '800' });
    badgeText.anchor.set(0.5, 0.5);
    badgeText.position.set(0, CIRCLE_R - 10);
    el.addChild(circle, clip, icon, badge, badgeText);
    el.eventMode = 'static';
    el.cursor = 'pointer';
    el.on('pointertap', onClick);
    return { el, circle, playerIndex };
  }

  private refresh(): void {
    if (!this.details || !this.popup) return;
    this.icons.forEach((v) => {
      v.circle.clear().circle(0, 0, CIRCLE_R).fill(0xffffff);
      if (v.playerIndex === this.selectedIndex) v.circle.stroke({ width: 4, color: 0x5099ff });
    });
    this.details.removeChildren().forEach((c) => c.destroy({ children: true }));
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const player = s.players[this.selectedIndex]!;
    const tribe = TRIBES.find((t) => t.id === player.tribe)!;
    const fastBonus = s.bonusAwarded && s.winnerIndex === player.index ? bonusScoreFor(s.players.length) : 0;
    const cw = this.popup.contentWidth;

    const header = makeLabel(`${player.name} (${tribe.name})`, {
      fontSize: 16,
      fill: tribe.color,
      fontWeight: '700',
      wordWrap: true,
      wordWrapWidth: cw,
    });
    header.anchor.set(0.5, 0);
    header.position.set(cw / 2, 0);
    this.details.addChild(header);
    let y = header.height + 6;
    for (const item of scoreBreakdown(map, player, fastBonus)) {
      const line = item.score === 0
        ? `${item.label}: ${item.count}`
        : item.count === 0
          ? `${item.label}: ${item.score}`
          : `${item.label}: ${item.count}, Scores: ${item.score}`;
      const label = makeLabel(line, { fontSize: 14, fill: 0xeeeeee, wordWrap: true, wordWrapWidth: cw });
      label.anchor.set(0.5, 0);
      label.position.set(cw / 2, y);
      this.details.addChild(label);
      y += label.height + 8;
    }
    const openedAch = unlockedAchievements(player);
    if (openedAch.length > 0) {
      const heading = makeLabel(t('ach.title'), {
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: '700',
        wordWrap: true,
        wordWrapWidth: cw,
      });
      heading.anchor.set(0.5, 0);
      heading.position.set(cw / 2, y + 4);
      this.details.addChild(heading);
      y += heading.height + 8;
      for (const id of openedAch) {
        const line = makeLabel(`${t(achievementNameKey(id))}: +${achievementPoints(id)}`, {
          fontSize: 14,
          fill: 0xeeeeee,
          wordWrap: true,
          wordWrapWidth: cw,
        });
        line.anchor.set(0.5, 0);
        line.position.set(cw / 2, y);
        this.details.addChild(line);
        y += line.height + 8;
      }
    }
    const total = makeLabel(`Total: ${totalScore(map, player)}`, {
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: '700',
      wordWrap: true,
      wordWrapWidth: cw,
    });
    total.anchor.set(0.5, 0);
    total.position.set(cw / 2, y + 4);
    this.details.addChild(total);
    this.popup.reflow();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.popup?.destroy();
    this.popup = null;
    this.el = null;
    this.host = null;
    this.details = null;
    this.icons = [];
  }
}
