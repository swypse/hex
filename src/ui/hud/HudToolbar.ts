import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { captureWinnerIndex } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { IconButton } from '../kit/iconButton';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
import { ActionTooltip } from '../kit/actionTooltip';
import { tooltipsEnabled } from '../kit/tooltipGate';
import { TOOLBAR_HEIGHT, isWideScreen, ACTION_TOOLBAR_MAX_WIDTH } from '../layout';
import { toolbarSpecs } from './toolbarSpecs';
import { hasAnyAvailableAction } from '../../game/playerActions';
import { STEP_CONFIG } from '../../game/tutorial/tutorialSteps';

const ICON_ACTIONS: Record<string, string> = {
  upgrade: 'upgrade',
  wall: 'wall',
  'upgrade-ship': 'upgrade-ship',
  heal: 'heal',
  disband: 'disband',
  capture: 'capture',
  spawn: 'spawn',
  sawmill: 'sawmill',
  mine: 'mine',
  port: 'port',
  temple: 'temple',
  forestTemple: 'forestTemple',
  road: 'road',
  bridge: 'bridge',
  bonus: 'bonus',
  bottle: 'bottle',
};

const LAST_TURN_COLOR = 0x9cff55;
const SIDE_PADDING = 12;
const PANEL_PADDING_X = 4;
const PANEL_CORNER_RADIUS = 4;
const OUTER_BG = 0x5297ff;
const INNER_BG = 0x3977d8;
const ACTION_BTN = {
  color: 0xd0e3ff,
  hoverColor: 0xffffff,
  pressedColor: 0xffffff,
  borderWidth: 0,
  disabledAlpha: 0.6,
  transparentDisabled: true,
} as const;

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private bg: Graphics | null = null;
  private panel: Container | null = null;
  private inner: Graphics | null = null;
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
    const panel = new Container();
    const inner = new Graphics();
    const row = new Container();
    const endTurnRow = new Container();
    const statsRow = new Container();
    el.addChild(bg, panel);
    panel.addChild(inner, statsRow, endTurnRow, row);
    root.addChild(el);
    this.el = el;
    this.bg = bg;
    this.panel = panel;
    this.inner = inner;
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
    if (!this.el || !this.bg || !this.panel || !this.inner || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    const barW = isWideScreen(screenW) ? ACTION_TOOLBAR_MAX_WIDTH : screenW;
    const barX = isWideScreen(screenW) ? (screenW - barW) / 2 : 0;
    const panelW = barW - PANEL_PADDING_X * 2;
    this.bg.clear().rect(0, 0, barW, TOOLBAR_HEIGHT).fill(OUTER_BG);
    this.bg.eventMode = 'static';
    this.panel.position.set(PANEL_PADDING_X, 0);
    const r = PANEL_CORNER_RADIUS;
    this.inner
      .clear()
      .moveTo(0, TOOLBAR_HEIGHT)
      .lineTo(0, r)
      .arcTo(0, 0, r, 0, r)
      .lineTo(panelW - r, 0)
      .arcTo(panelW, 0, panelW, r, r)
      .lineTo(panelW, TOOLBAR_HEIGHT)
      .closePath()
      .fill(INNER_BG);
    this.el.position.set(barX, screenH - TOOLBAR_HEIGHT);
    const barY = (TOOLBAR_HEIGHT - 48) / 2;
    if (this.statsRow) {
      this.statsRow.position.set(SIDE_PADDING, barY);
    }
    if (this.endTurnRow) {
      const btn = this.endTurnRow.children.length > 0 ? this.endTurnRow.getChildAt(0) : null;
      const width = btn ? btn.width : 48;
      this.endTurnRow.position.set(panelW - width - SIDE_PADDING, barY);
    }
    if (this.row) {
      const statsW = this.statsRow ? this.statsRow.width : 0;
      const endTurnW = this.endTurnRow ? this.endTurnRow.width : 0;
      const freeLeft = SIDE_PADDING + statsW + 8;
      const freeRight = panelW - SIDE_PADDING - endTurnW - 8;
      const freeW = Math.max(0, freeRight - freeLeft);
      const maxW = Math.min(freeW, ACTION_TOOLBAR_MAX_WIDTH * 0.9);
      const scale = this.row.width > maxW ? maxW / this.row.width : 1;
      this.row.scale.set(scale, scale);
      const center = freeW > 0 ? (freeLeft + freeRight) / 2 : panelW / 2;
      this.row.position.set(center - (this.row.width * scale) / 2, barY);
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
      const btn = new IconButton({ icon, disabled, onClick, size: 48, iconFactory: makeActionButtonIcon, ...ACTION_BTN });
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
      icon: ACTION_BUTTON_ICON_FILES['stats']!,
      size: 48,
      onClick: () => useGameStore.getState().setOverlay({ kind: 'stats' }),
      iconFactory: makeActionButtonIcon,
      ...ACTION_BTN,
    });
    this.statsRow.addChild(stats);
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, stats, t('hud.stats')));

    const endTurn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['end-turn']!,
      disabled: store.aiActive,
      onClick: () => gameController.endTurn(),
      size: 48,
      iconFactory: makeActionButtonIcon,
      ...ACTION_BTN,
      color: isLastTurn() ? LAST_TURN_COLOR : ACTION_BTN.color,
    });
    this.endTurnRow.addChild(endTurn);
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, endTurn, t('hud.endTurn')));

    if (store.tutorialHighlightEndTurn && !store.aiActive) {
      const ring = new Graphics();
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.endTurnRow.addChild(ring);
      this.endTurnPulse = ring;
      this.startEndTurnPulse();
    }

    const human = store.players[store.localPlayerIndex];
    const map = gameController.getMap();
    const noActions =
      !store.aiActive &&
      !store.gameOver &&
      !store.paused &&
      !store.tutorial &&
      !!human &&
      !!map &&
      !hasAnyAvailableAction(map, human, store.turn);
    if (noActions && !store.tutorialHighlightEndTurn && !this.endTurnPulse) {
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
    this.panel = null;
    this.inner = null;
    this.row = null;
    this.endTurnRow = null;
    this.statsRow = null;
    this.host = null;
  }
}
