import { Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { Player } from '../../game/players';
import { scoreBreakdown, totalScore } from '../../game/score';
import { bonusScoreFor, GAME_MODE_NAMES, rankPlayers } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';

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

    const el = new Container();
    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x0a0a14, alpha: 0.92 });
    el.addChild(bg);

    const ranked = rankPlayers(s.players, map);
    const placeOf = new Map(ranked.map((p, i) => [p.index, i + 1]));
    this.selectedIndex = s.localPlayerIndex;

    let y = 40;
    const banner = makeLabel(`${winner.name} (${tribe.name}) wins!`, { fontSize: 32, fill: tribe.color, fontWeight: '800' });
    banner.anchor.set(0.5, 0.5);
    banner.position.set(host.app.screen.width / 2, y);
    el.addChild(banner);
    y += 40;

    const mode = makeLabel(`Mode: ${GAME_MODE_NAMES[s.mode]}`, { fontSize: 16, fill: 0xcccccc });
    mode.anchor.set(0.5, 0.5);
    mode.position.set(host.app.screen.width / 2, y);
    el.addChild(mode);
    y += 34;

    const turns = makeLabel(`Turns: ${s.turn}`, { fontSize: 16, fill: 0xcccccc });
    turns.anchor.set(0.5, 0.5);
    turns.position.set(host.app.screen.width / 2, y);
    el.addChild(turns);
    y += 34;

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
    iconRow.position.set(host.app.screen.width / 2 - rowW / 2, y);
    el.addChild(iconRow);
    y += 96;

    this.details = new Container();
    this.details.position.set(host.app.screen.width / 2, y);
    el.addChild(this.details);

    const again = new Button({ label: 'Play again', width: 180, onClick: () => useGameStore.getState().setScreen('setup') });
    const menu = new Button({ label: 'Main menu', width: 180, onClick: () => useGameStore.getState().setScreen('start') });
    again.position.set(host.app.screen.width / 2 - 190, host.app.screen.height - 60);
    menu.position.set(host.app.screen.width / 2 + 10, host.app.screen.height - 60);
    el.addChild(again, menu);

    root.addChild(el);
    this.el = el;
    this.refresh();
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
    if (!this.details || !this.host) return;
    this.icons.forEach((v) => {
      v.circle.clear().circle(0, 0, CIRCLE_R).fill(0xffffff);
      if (v.playerIndex === this.selectedIndex) v.circle.stroke({ width: 4, color: 0x5099ff });
    });
    this.details.removeChildren();
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map) return;
    const player = s.players[this.selectedIndex]!;
    const tribe = TRIBES.find((t) => t.id === player.tribe)!;
    const fastBonus = s.bonusAwarded && s.winnerIndex === player.index ? bonusScoreFor(s.players.length) : 0;
    const header = makeLabel(`${player.name} (${tribe.name})`, { fontSize: 22, fill: tribe.color, fontWeight: '700' });
    header.anchor.set(0.5, 0);
    header.position.set(0, 0);
    this.details.addChild(header);
    let y = 34;
    for (const item of scoreBreakdown(map, player, fastBonus)) {
      const line = item.score === 0
        ? `${item.label}: ${item.count}`
        : item.count === 0
          ? `${item.label}: ${item.score}`
          : `${item.label}: ${item.count}, Scores: ${item.score}`;
      const label = makeLabel(line, { fontSize: 16, fill: 0xeeeeee });
      label.anchor.set(0.5, 0);
      label.position.set(0, y);
      this.details.addChild(label);
      y += 24;
    }
    const total = makeLabel(`Total: ${totalScore(map, player)}`, { fontSize: 18, fill: 0xffffff, fontWeight: '700' });
    total.anchor.set(0.5, 0);
    total.position.set(0, y + 6);
    this.details.addChild(total);
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
