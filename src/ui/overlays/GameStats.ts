import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { UNKNOWN_TRIBE_COLOR } from '../../game/discovery';
import { totalScore } from '../../game/score';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';

export class GameStats {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private rows: Container | null = null;
  private closeBtn: Button | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();

    const bg = new Graphics();
    bg.rect(0, 0, host.app.screen.width, host.app.screen.height).fill({ color: 0x000000, alpha: 0.85 });
    bg.eventMode = 'static';
    el.addChild(bg);

    const title = makeLabel('Stats', { fontSize: 28, fill: 0xffffff, fontWeight: '700' });
    title.anchor.set(0.5, 0);
    title.position.set(host.app.screen.width / 2, 32);
    el.addChild(title);

    const close = new Button({ label: 'Close', onClick: () => useGameStore.getState().setOverlay(null) });
    el.addChild(close);

    const rows = new Container();
    el.addChild(rows);

    root.addChild(el);
    this.el = el;
    this.closeBtn = close;
    this.rows = rows;

    this.layout();
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useGameStore.getState().setOverlay(null);
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  private layout = (): void => {
    if (!this.el || !this.host || !this.closeBtn) return;
    this.closeBtn.position.set(this.host.app.screen.width / 2 - this.closeBtn.width / 2, this.host.app.screen.height - 48);
  };

  private render(): void {
    if (!this.el || !this.host || !this.rows) return;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const ranked = [...s.players]
      .map((p) => ({ p, score: map ? totalScore(map, p) : p.score }))
      .sort((a, b) => b.score - a.score);

    this.rows.removeChildren();
    const lineH = 36;
    const local = s.players[s.localPlayerIndex];
    const known = new Set<number>(local ? [local.tribe, ...(local.knownTribes ?? [])] : []);
    ranked.forEach(({ p, score }, i) => {
      const tribe = TRIBES.find((t) => t.id === p.tribe)!;
      const knownTribe = known.has(p.tribe);
      const role = p.index === s.localPlayerIndex ? ' (you)' : p.isHuman ? '' : ' (AI)';
      const t = makeLabel(`${p.name} (${knownTribe ? tribe.name : 'Unknown tribe'})${role}: ${score} pts (kills: ${p.kills})`, {
        fontSize: 18,
        fill: knownTribe ? tribe.color : UNKNOWN_TRIBE_COLOR,
      });
      t.position.set(0, i * lineH);
      this.rows!.addChild(t);
    });
    this.rows.position.set(this.host.app.screen.width / 2, this.host.app.screen.height / 2 - (ranked.length * lineH) / 2);
    this.rows.children.forEach((c) => {
      const child = c as { width: number; position: { set(x: number, y: number): void; y: number } };
      child.position.set(-child.width / 2, child.position.y);
    });
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.unsub = null;
    this.onResize = null;
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.rows = null;
    this.closeBtn = null;
    this.host = null;
  }
}
