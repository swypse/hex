import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { captureWinnerIndex } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { IconButton } from '../kit/iconButton';
import { ActionTooltip } from '../kit/actionTooltip';
import { tooltipsEnabled } from '../kit/tooltipGate';
import { TOOLBAR_HEIGHT } from '../layout';
import { toolbarSpecs } from './toolbarSpecs';
import { STEP_CONFIG } from '../../game/tutorial/tutorialSteps';

const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade.png',
  'upgrade-ship': 'upgrade.png',
  heal: 'heal.png',
  capture: 'capture.png',
  spawn: 'spawn.png',
  sawmill: 'build-sawmill.png',
  mine: 'build-mine.png',
  port: 'build-port.png',
  temple: 'water-temple.png',
  forestTemple: 'forest-temple.png',
  road: 'build-road.png',
  bridge: 'build-bridge.png',
  bonus: 'get-bonus.png',
};

const LAST_TURN_COLOR = 0x9cff55;
const SIDE_PADDING = 12;
const ACTION_BTN = {
  color: 0x373749,
  hoverColor: 0xffffff,
  pressedColor: 0xffffff,
  borderColor: 0x41414e,
  borderWidth: 4,
  disabledAlpha: 0.8,
  transparentDisabled: true,
} as const;

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private bg: Graphics | null = null;
  private row: Container | null = null;
  private endTurnRow: Container | null = null;
  private statsRow: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private tooltips: ActionTooltip[] = [];
  private stopEndTurnPulse: (() => void) | null = null;
  private endTurnPulse: Graphics | null = null;
  private stopActionPulse: (() => void) | null = null;
  private actionPulse: Graphics | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const bg = new Graphics();
    const row = new Container();
    const endTurnRow = new Container();
    const statsRow = new Container();
    el.addChild(bg, row, endTurnRow, statsRow);
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.row = row;
    this.endTurnRow = endTurnRow;
    this.statsRow = statsRow;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.bg || !this.host) return;
    this.bg.clear().rect(0, 0, this.host.app.screen.width, TOOLBAR_HEIGHT).fill(0x202032);
    this.bg.eventMode = 'static';
    this.el.position.set(0, this.host.app.screen.height - TOOLBAR_HEIGHT);
    const barY = (TOOLBAR_HEIGHT - 48) / 2;
    if (this.row) {
      const maxW = this.host.app.screen.width * 0.8;
      const scale = this.row.width > maxW ? maxW / this.row.width : 1;
      this.row.scale.set(scale, scale);
      this.row.position.set((this.host.app.screen.width - this.row.width * scale) / 2, barY);
    }
    if (this.endTurnRow) {
      const btn = this.endTurnRow.children.length > 0 ? this.endTurnRow.getChildAt(0) : null;
      const width = btn ? btn.width : 48;
      this.endTurnRow.position.set(this.host.app.screen.width - width - SIDE_PADDING, barY);
    }
    if (this.statsRow) {
      this.statsRow.position.set(SIDE_PADDING, barY);
    }
  };

  private update(): void {
    if (!this.el || !this.row || !this.endTurnRow || !this.statsRow || !this.host) return;
    if (this.stopEndTurnPulse) {
      this.stopEndTurnPulse();
      this.stopEndTurnPulse = null;
    }
    this.endTurnPulse = null;
    if (this.stopActionPulse) {
      this.stopActionPulse();
      this.stopActionPulse = null;
    }
    this.actionPulse = null;
    for (const t of this.tooltips) t.destroy();
    this.tooltips = [];
    while (this.row.children.length > 0) {
      this.row.removeChildAt(0).destroy({ children: true });
    }
    while (this.endTurnRow.children.length > 0) {
      this.endTurnRow.removeChildAt(0).destroy({ children: true });
    }
    while (this.statsRow.children.length > 0) {
      this.statsRow.removeChildAt(0).destroy({ children: true });
    }
    const store = useGameStore.getState();
    const actions = toolbarSpecs();
    const GAP = 12;
    const storeStep = store.tutorial && store.tutorialStep !== null ? store.tutorialStep : null;
    const tutorialKey = storeStep ? (STEP_CONFIG[storeStep].toolbarKey ?? null) : null;
    let x = 0;

    const maybeHighlightAction = (btn: Container, key: string): void => {
      if (!tutorialKey || key !== tutorialKey || this.actionPulse) return;
      const ring = new Graphics();
      ring.position.set(btn.position.x, 0);
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.row!.addChild(ring);
      this.actionPulse = ring;
      this.startActionPulse();
    };

    const addText = (label: string, disabled: boolean, onClick: () => void, paddingX: number, key: string): void => {
      const btn = new Button({ label, disabled, onClick, paddingX, paddingY: 10, fontSize: 20 });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
      if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, btn, label));
      maybeHighlightAction(btn, key);
    };
    const addIcon = (icon: string, disabled: boolean, onClick: () => void, tooltipText: string, key: string): void => {
      const btn = new IconButton({ icon, disabled, onClick, size: 48, ...ACTION_BTN });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
      if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, btn, tooltipText));
      maybeHighlightAction(btn, key);
    };

    const isLastTurn = (): boolean => {
      const s = useGameStore.getState();
      if (s.gameOver) return false;
      if (s.mode === 'turns30') return s.turn >= 30;
      const map = gameController.getMap();
      return !!map && captureWinnerIndex(map) !== null;
    };

    for (const spec of actions) {
      if (spec.disabled || store.aiActive || store.gameOver) continue;
      const iconFile = ICON_ACTIONS[spec.key];
      if (iconFile) addIcon(iconFile, spec.disabled, spec.onClick, spec.label, spec.key);
      else addText(spec.label, spec.disabled, spec.onClick, 16, spec.key);
    }

    const stats = new IconButton({
      icon: 'stats.png',
      size: 48,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'stats' }),
      ...ACTION_BTN,
    });
    this.statsRow.addChild(stats);
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, stats, 'Game stats'));

    const endTurn = new IconButton({
      icon: 'end-turn.png',
      disabled: store.aiActive,
      onClick: () => gameController.endTurn(),
      size: 48,
      ...ACTION_BTN,
      color: isLastTurn() ? LAST_TURN_COLOR : ACTION_BTN.color,
    });
    this.endTurnRow.addChild(endTurn);
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, endTurn, 'End turn'));

    if (store.tutorialHighlightEndTurn && !store.aiActive) {
      const ring = new Graphics();
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.endTurnRow.addChild(ring);
      this.endTurnPulse = ring;
      this.startEndTurnPulse();
    }

    this.layout();
  }

  private startEndTurnPulse(): void {
    if (this.stopEndTurnPulse || !this.host) return;
    const ticker = this.host.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.endTurnPulse || this.endTurnPulse.destroyed) {
        ticker.remove(fn);
        this.stopEndTurnPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      const r = 24 + 2 * Math.abs(Math.sin(phase * Math.PI * 2));
      this.endTurnPulse.clear().circle(24, 24, r).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopEndTurnPulse = () => ticker.remove(fn);
  }

  private startActionPulse(): void {
    if (this.stopActionPulse || !this.host) return;
    const ticker = this.host.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.actionPulse || this.actionPulse.destroyed) {
        ticker.remove(fn);
        this.stopActionPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      const r = 24 + 2 * Math.abs(Math.sin(phase * Math.PI * 2));
      this.actionPulse.clear().circle(24, 24, r).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopActionPulse = () => ticker.remove(fn);
  }

  destroy(): void {
    for (const t of this.tooltips) t.destroy();
    this.tooltips = [];
    if (this.stopEndTurnPulse) {
      this.stopEndTurnPulse();
      this.stopEndTurnPulse = null;
    }
    this.endTurnPulse = null;
    if (this.stopActionPulse) {
      this.stopActionPulse();
      this.stopActionPulse = null;
    }
    this.actionPulse = null;
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.bg = null;
    this.row = null;
    this.endTurnRow = null;
    this.statsRow = null;
    this.host = null;
  }
}
