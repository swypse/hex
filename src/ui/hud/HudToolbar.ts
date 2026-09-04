import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { captureWinnerIndex } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { IconButton } from '../kit/iconButton';
import { ActionTooltip } from '../kit/actionTooltip';
import { TOOLBAR_HEIGHT } from '../layout';
import { toolbarSpecs } from './toolbarSpecs';

const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade.png',
  'upgrade-ship': 'upgrade.png',
  heal: 'heal.png',
  capture: 'capture.png',
  spawn: 'spawn.png',
  sawmill: 'build.png',
  mine: 'build.png',
  port: 'build.png',
  temple: 'build.png',
  forestTemple: 'build.png',
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
    let x = 0;

    const addText = (label: string, disabled: boolean, onClick: () => void, paddingX: number): void => {
      const btn = new Button({ label, disabled, onClick, paddingX, paddingY: 10, fontSize: 20 });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
      this.tooltips.push(new ActionTooltip(this.el!, btn, label));
    };
    const addIcon = (icon: string, disabled: boolean, onClick: () => void, tooltipText: string): void => {
      const btn = new IconButton({ icon, disabled, onClick, size: 48, ...ACTION_BTN });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
      this.tooltips.push(new ActionTooltip(this.el!, btn, tooltipText));
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
      if (iconFile) addIcon(iconFile, spec.disabled, spec.onClick, spec.label);
      else addText(spec.label, spec.disabled, spec.onClick, 16);
    }

    const stats = new IconButton({
      icon: 'stats.png',
      size: 48,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'stats' }),
      ...ACTION_BTN,
    });
    this.statsRow.addChild(stats);
    this.tooltips.push(new ActionTooltip(this.el!, stats, 'Game stats'));

    const endTurn = new IconButton({
      icon: 'end-turn.png',
      disabled: store.aiActive,
      onClick: () => gameController.endTurn(),
      size: 48,
      ...ACTION_BTN,
      color: isLastTurn() ? LAST_TURN_COLOR : ACTION_BTN.color,
    });
    this.endTurnRow.addChild(endTurn);
    this.tooltips.push(new ActionTooltip(this.el!, endTurn, 'End turn'));

    this.layout();
  }

  destroy(): void {
    for (const t of this.tooltips) t.destroy();
    this.tooltips = [];
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
