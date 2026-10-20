import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { FontSize, OverlayKind, Screen } from '@enums';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeLabel } from '../../gfx/label';
import { useGameStore } from '../../store/game-store';
import { type UIHost, type Widget } from '../host';
import { IconButton } from '../kit/icon-button';
import { SKILLS_BUTTON_SIZE, scoreButtonsPosition, SCORE_ACTION_BG, SCORE_ACTION_BG_ACTIVE } from './layout';

const BADGE_RADIUS = 9;
const BADGE_COLOR = 0xd9534f;

/** Trade button below the achievements button; the badge counts the proposals waiting for the player, else the orders open to them. */
export class HudTrade implements Widget {
  private el: Container | null = null;
  private badge: Container | null = null;
  private host: UIHost | null = null;
  private onResize: (() => void) | null = null;
  private unsub: (() => void) | null = null;
  private shown = -1;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const btn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['trade']!,
      size: SKILLS_BUTTON_SIZE,
      color: SCORE_ACTION_BG,
      hoverColor: SCORE_ACTION_BG_ACTIVE,
      pressedColor: SCORE_ACTION_BG_ACTIVE,
      onClick: () => useGameStore.getState().setOverlay({ kind: OverlayKind.TRADE }),
      iconFactory: makeActionButtonIcon,
    });
    const badge = new Container();
    el.addChild(btn, badge);
    root.addChild(el);
    this.el = el;
    this.badge = badge;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private count(): number {
    const s = useGameStore.getState();
    const sim = gameController.getSim();
    const local = s.players[s.localPlayerIndex];
    if (!sim || !local) return 0;
    const waiting = sim.trading.ordersOf(local.index).reduce((n, o) => n + o.proposals.length, 0);
    if (waiting > 0) return waiting;
    return sim.trading.visibleOrders(local).filter((o) => !o.proposals.some((p) => p.seller === local.index)).length;
  }

  private update(): void {
    if (!this.el || !this.badge) return;
    const s = useGameStore.getState();
    this.el.visible = s.screen === Screen.GAME && !s.tutorial && !!gameController.getSim();
    if (!this.el.visible) return;
    const n = this.count();
    if (n === this.shown) return;
    this.shown = n;
    this.badge.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (n <= 0) return;
    const dot = new Graphics().circle(0, 0, BADGE_RADIUS).fill(BADGE_COLOR);
    const text = makeLabel(String(n), { fontSize: FontSize.VERY_SMALL, fill: 0xffffff });
    text.anchor.set(0.5, 0.5);
    this.badge.addChild(dot, text);
    this.badge.position.set(SKILLS_BUTTON_SIZE - BADGE_RADIUS / 2, BADGE_RADIUS / 2);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const pos = scoreButtonsPosition(this.host.app.screen.width, this.host.app.screen.height).trade;
    this.el.position.set(pos.x, pos.y);
  };

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.badge = null;
    this.host = null;
  }
}
