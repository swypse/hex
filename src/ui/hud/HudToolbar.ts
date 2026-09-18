import { t } from '../../i18n';
import { Container, Graphics, Rectangle } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { captureWinnerIndex } from '../../game/gameMode';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { Button } from '../kit/button';
import { IconButton } from '../kit/iconButton';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../kit/actionButtonIcons';
import { ActionTooltip } from '../kit/actionTooltip';
import { tooltipsEnabled } from '../kit/tooltipGate';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../layout';
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
  deal: 'deal',
};

const LAST_TURN_COLOR = 0x9cff55;
const SIDE_PADDING = 12;
const ACTION_BTN = {
  color: 0xffffff,
  hoverColor: 0xd0e3ff,
  pressedColor: 0xd0e3ff,
  borderWidth: 0,
  disabledAlpha: 0.6,
  transparentDisabled: true,
} as const;

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private hit: Graphics | null = null;
  private row: Container | null = null;
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
    const hit = new Graphics();
    const row = new Container();
    el.addChild(hit, row);
    root.addChild(el);
    this.el = el;
    this.hit = hit;
    this.row = row;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.hit || !this.row || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    this.hit.eventMode = 'static';
    this.hit.hitArea = new Rectangle(0, 0, screenW, TOOLBAR_HEIGHT);
    this.el.position.set(0, screenH - TURN_BAR_HEIGHT - TOOLBAR_HEIGHT);
    const barY = (TOOLBAR_HEIGHT - 48) / 2;
    const maxW = Math.max(0, screenW - SIDE_PADDING * 2);
    const rowW = this.row.width;
    const scale = rowW > maxW ? maxW / rowW : 1;
    this.row.scale.set(scale, scale);
    this.row.position.set(screenW / 2 - (rowW * scale) / 2, barY);
  };

  private update(): void {
    if (!this.el || !this.row || !this.host) return;
    const store = useGameStore.getState();
    // While another player (or the AI) is taking their move the actions are not
    // usable, so hide the whole toolbar instead of showing disabled buttons.
    this.el.visible = !store.aiActive;
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
      const btn = new IconButton({
        icon,
        disabled,
        onClick,
        size: 48,
        iconFactory: makeActionButtonIcon, ...ACTION_BTN
      });
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
      if ((spec.disabled && !spec.visibleWhenDisabled) || store.aiActive || store.gameOver) continue;
      const iconFile = ICON_ACTIONS[spec.key];
      if (iconFile) addIcon(iconFile, spec.disabled, spec.onClick, spec.label, spec.key);
      else addText(spec.label, spec.disabled, spec.onClick, 16, spec.key);
    }

    const endTurn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['end-turn']!,
      disabled: store.aiActive,
      onClick: () => gameController.endTurn(),
      size: 48,
      iconFactory: makeActionButtonIcon,
      ...ACTION_BTN,
      color: isLastTurn() ? LAST_TURN_COLOR : ACTION_BTN.color,
    });
    endTurn.position.set(x, 0);
    this.row.addChild(endTurn);
    x += endTurn.width + GAP;
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, endTurn, t('hud.endTurn')));

    if (store.tutorialHighlightEndTurn && !store.aiActive) {
      const ring = new Graphics();
      ring.position.set(endTurn.position.x, 0);
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.row.addChild(ring);
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
      ring.position.set(endTurn.position.x, 0);
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.row.addChild(ring);
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
    this.hit = null;
    this.row = null;
    this.host = null;
  }
}
