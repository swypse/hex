import { gameController } from '@/controller/game-controller';
import { captureWinnerIndex } from '@/game/game-mode';
import { hasAnyAvailableAction } from '@/game/player-actions';
import { skillPulseStep, STEP_CONFIG } from '@/game/tutorial/tutorial-steps';
import { t } from '@/i18n';
import { useGameStore } from '@/store/game-store';
import { FontSize, GameMode, OverlayKind } from '@enums';
import { Container, Graphics, Rectangle, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { type UIHost, type Widget } from '../host';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../../gfx/action-button-icons';
import { ActionTooltip } from '../kit/action-tooltip';
import { Button } from '../kit/button';
import { IconButton } from '../kit/icon-button';
import { tooltipsEnabled } from '../kit/tooltip-gate';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from './layout';
import { toolbarSpecs } from './toolbar-specs';

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
  farm: 'farm',
  granary: 'granary',
  university: 'university',
  'burn-farm': 'burn-farm',
  'burn-granary': 'burn-granary',
  'burn-road': 'burn-road',
  road: 'road',
  bridge: 'bridge',
  bonus: 'bonus',
  bottle: 'bottle',
  deal: 'deal',
  repair: 'build',
  stealth: 'stealth',
  build: 'build',
  'thorn-trap': 'thorn-trap',
  extinguish: 'extinguish',
  storm: 'stormcaller',
  lightning: 'lightning',
};

const LAST_TURN_COLOR = 0x9cff55;
const SIDE_PADDING = 12;
const FOCUS_RING_COLOR = 0xffd54a;
const FOCUS_RING_PAD = 4;
/** Pointer travel (px) after which a press on the toolbar becomes a scroll drag, not a tap. */
const DRAG_THRESHOLD = 6;
/** Vertical room around the 48px buttons kept visible inside the scroll mask (pulse rings, focus ring). */
const MASK_PAD_Y = 8;

interface FocusEntry {
  btn: Container;
  activate: () => void;
}
const ACTION_BTN = {
  color: { color: 0xffffff, alpha: 1 },
  hoverColor: { color: 0xffffff, alpha: 1 },
  pressedColor: { color: 0xffffff, alpha: 1 },
  borderWidth: 0,
  disabledAlpha: 0.6,
  transparentDisabled: true,
} as const;

export class HudToolbar implements Widget {
  private el: Container | null = null;
  private row: Container | null = null;
  /** Clips the row to the screen width when it overflows; the row scrolls inside it. */
  private viewport: Container | null = null;
  private maskG: Graphics | null = null;
  private pad: Graphics | null = null;
  private scrollX = 0;
  private maxScroll = 0;
  private activePointer: number | null = null;
  private dragStartX = 0;
  private dragStartScroll = 0;
  private dragged = false;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private tooltips: ActionTooltip[] = [];
  private stopEndTurnPulse: (() => void) | null = null;
  private endTurnPulse: Graphics | null = null;
  private stopActionPulse: (() => void) | null = null;
  private actionPulse: Graphics | null = null;
  private stopSkillsPulse: (() => void) | null = null;
  private skillsPulse: Graphics | null = null;
  /** Enabled buttons reachable by keyboard (Tab), rebuilt on every update. */
  private focusables: FocusEntry[] = [];
  /** Index into `focusables` while keyboard focus mode is on, else null. */
  private focusIndex: number | null = null;
  private focusRing: Graphics | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    const row = new Container();
    const viewport = new Container();
    const pad = new Graphics();
    pad.eventMode = 'static';
    const maskG = new Graphics();
    viewport.addChild(pad, row);
    viewport.mask = maskG;
    viewport.eventMode = 'static';
    viewport.on('pointerdown', this.onPointerDown);
    viewport.on('wheel', this.onWheel);
    viewport.on('pointertapcapture', this.onTapCapture);
    el.addChild(viewport, maskG);
    root.addChild(el);
    this.el = el;
    this.row = row;
    this.viewport = viewport;
    this.maskG = maskG;
    this.pad = pad;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  /** Tab toggles keyboard focus on the buttons; left/right move it, Enter applies. */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const store = useGameStore.getState();
    if (store.overlay !== null || store.texturesLoading || store.aiActive || store.gameOver) {
      this.setFocus(null);
      return;
    }
    const consume = (): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.key === 'Tab') {
      consume();
      if (e.repeat) return;
      this.setFocus(this.focusIndex === null && this.focusables.length > 0 ? 0 : null);
      return;
    }
    if (this.focusIndex === null) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      consume();
      const n = this.focusables.length;
      this.setFocus((this.focusIndex + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      consume();
      if (e.repeat) return;
      const entry = this.focusables[this.focusIndex];
      this.setFocus(null);
      entry?.activate();
    }
  };

  private setFocus(index: number | null): void {
    this.focusIndex = index;
    this.drawFocusRing();
  }

  private drawFocusRing(): void {
    this.focusRing?.destroy();
    this.focusRing = null;
    if (!this.el || !this.row || this.focusIndex === null) return;
    const entry = this.focusables[this.focusIndex];
    if (!entry) {
      this.focusIndex = null;
      return;
    }
    const k = this.row.scale.x;
    this.revealFocused(entry.btn);
    const ring = new Graphics();
    ring
      .roundRect(
        this.row.position.x + entry.btn.position.x * k - FOCUS_RING_PAD,
        this.row.position.y - FOCUS_RING_PAD,
        entry.btn.width * k + FOCUS_RING_PAD * 2,
        entry.btn.height * k + FOCUS_RING_PAD * 2,
        8,
      )
      .stroke({ width: 3, color: FOCUS_RING_COLOR, alpha: 0.95 });
    this.el.addChild(ring);
    this.focusRing = ring;
  }

  /** Scrolls the row just enough to bring a keyboard-focused button fully into view. */
  private revealFocused(btn: Container): void {
    if (this.maxScroll <= 0 || !this.host) return;
    const left = btn.position.x - FOCUS_RING_PAD;
    const right = btn.position.x + btn.width + FOCUS_RING_PAD;
    const viewW = this.host.app.screen.width - SIDE_PADDING * 2;
    let next = this.scrollX;
    if (left < next) next = left;
    else if (right > next + viewW) next = right - viewW;
    next = Math.min(Math.max(0, next), this.maxScroll);
    if (next === this.scrollX) return;
    this.scrollX = next;
    this.layout();
  }

  private layout = (): void => {
    if (!this.el || !this.row || !this.host) return;
    const screenW = this.host.app.screen.width;
    const screenH = this.host.app.screen.height;
    this.el.position.set(0, screenH - TURN_BAR_HEIGHT - TOOLBAR_HEIGHT);
    const barY = (TOOLBAR_HEIGHT - 48) / 2;
    const maxW = Math.max(0, screenW - SIDE_PADDING * 2);
    const rowW = this.row.width;
    const overflow = rowW > maxW;
    this.maxScroll = overflow ? rowW - maxW : 0;
    this.scrollX = Math.min(Math.max(0, this.scrollX), this.maxScroll);
    // Buttons keep their size: a row wider than the screen scrolls instead of shrinking.
    this.row.position.set(overflow ? SIDE_PADDING - this.scrollX : screenW / 2 - rowW / 2, barY);
    const clipX = overflow ? SIDE_PADDING : 0;
    const clipW = overflow ? maxW : screenW;
    this.maskG?.clear().rect(clipX, barY - MASK_PAD_Y, clipW, 48 + MASK_PAD_Y * 2).fill(0xffffff);
    this.pad?.clear().rect(clipX, barY - MASK_PAD_Y, clipW, 48 + MASK_PAD_Y * 2).fill({ color: 0x000000, alpha: 0.001 });
    if (this.viewport) this.viewport.hitArea = new Rectangle(clipX, barY - MASK_PAD_Y, clipW, 48 + MASK_PAD_Y * 2);
  };

  private onWheel = (e: FederatedWheelEvent): void => {
    if (this.maxScroll <= 0) return;
    this.scrollBy(e.deltaX || e.deltaY);
  };

  private scrollBy(dx: number): void {
    this.scrollX = Math.min(Math.max(0, this.scrollX + dx), this.maxScroll);
    this.layout();
    this.drawFocusRing();
  }

  private onPointerDown = (e: FederatedPointerEvent): void => {
    if (this.maxScroll <= 0 || this.activePointer !== null || e.button !== 0) return;
    this.activePointer = e.pointerId;
    this.dragStartX = e.clientX;
    this.dragStartScroll = this.scrollX;
    this.dragged = false;
    window.addEventListener('pointermove', this.onWindowMove);
    window.addEventListener('pointerup', this.onWindowUp);
    window.addEventListener('pointercancel', this.onWindowUp);
  };

  /** A tap that ends a real drag must not press the button under the finger. */
  private onTapCapture = (e: FederatedPointerEvent): void => {
    if (this.dragged && e.pointerId === this.activePointer) e.stopPropagation();
  };

  private onWindowMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    const delta = this.dragStartX - e.clientX;
    if (!this.dragged) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      this.dragged = true;
    }
    this.scrollX = this.dragStartScroll + delta;
    this.layout();
    this.drawFocusRing();
  };

  private onWindowUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    // Cleared after the tap event of this release has been dispatched.
    setTimeout(() => {
      this.activePointer = null;
      this.dragged = false;
    }, 0);
    this.detachPointerListeners();
  };

  private detachPointerListeners(): void {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowUp);
  }

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
    if (this.stopSkillsPulse) {
      this.stopSkillsPulse();
      this.stopSkillsPulse = null;
    }
    this.skillsPulse = null;
    for (const t of this.tooltips) t.destroy();
    this.tooltips = [];
    while (this.row.children.length > 0) {
      this.row.removeChildAt(0).destroy({ children: true });
    }
    const actions = toolbarSpecs();
    this.focusables = [];
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
      const btn = new Button({ label, disabled, onClick, paddingX, paddingY: 10, fontSize: FontSize.BIG });
      btn.position.set(x, 0);
      this.row!.addChild(btn);
      x += btn.width + GAP;
      if (!disabled) this.focusables.push({ btn, activate: onClick });
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
      if (!disabled) this.focusables.push({ btn, activate: onClick });
      if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, btn, tooltipText));
      maybeHighlightAction(btn, key);
    };

    const isLastTurn = (): boolean => {
      const s = useGameStore.getState();
      if (s.gameOver) return false;
      if (s.mode === GameMode.TURNS30) return s.turn >= 30;
      const map = gameController.getMap();
      return !!map && captureWinnerIndex(map) !== null;
    };

    const skillsBtn = new IconButton({
      icon: ACTION_BUTTON_ICON_FILES['skills']!,
      onClick: () => useGameStore.getState().setOverlay({ kind: OverlayKind.SKILL }),
      size: 48,
      iconFactory: makeActionButtonIcon,
      ...ACTION_BTN,
    });
    skillsBtn.position.set(x, 0);
    this.row.addChild(skillsBtn);
    x += skillsBtn.width + GAP;
    this.focusables.push({ btn: skillsBtn, activate: () => useGameStore.getState().setOverlay({ kind: OverlayKind.SKILL }) });
    if (tooltipsEnabled()) this.tooltips.push(new ActionTooltip(this.el!, skillsBtn, t('skillTree.title')));
    if (store.tutorial && skillPulseStep(store.tutorialStep) && !store.aiActive) {
      const ring = new Graphics();
      ring.position.set(skillsBtn.position.x, 0);
      ring.circle(24, 24, 26).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
      this.row.addChild(ring);
      this.skillsPulse = ring;
      this.startSkillsPulse();
    }

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
    if (!store.aiActive) this.focusables.push({ btn: endTurn, activate: () => gameController.endTurn() });
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
    if (this.focusIndex !== null && this.focusIndex >= this.focusables.length) this.focusIndex = this.focusables.length > 0 ? this.focusables.length - 1 : null;
    this.drawFocusRing();
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

  private startSkillsPulse(): void {
    if (this.stopSkillsPulse || !this.host) return;
    const ticker = this.host.app.ticker;
    const start = performance.now();
    const fn = (): void => {
      if (!this.skillsPulse || this.skillsPulse.destroyed) {
        ticker.remove(fn);
        this.stopSkillsPulse = null;
        return;
      }
      const phase = ((performance.now() - start) % 900) / 900;
      const r = 24 + 2 * Math.abs(Math.sin(phase * Math.PI * 2));
      this.skillsPulse.clear().circle(24, 24, r).stroke({ width: 4, color: 0xffd700, alpha: 0.9 });
    };
    ticker.add(fn);
    this.stopSkillsPulse = () => ticker.remove(fn);
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
    if (this.stopSkillsPulse) {
      this.stopSkillsPulse();
      this.stopSkillsPulse = null;
    }
    this.skillsPulse = null;
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.detachPointerListeners();
    this.activePointer = null;
    this.viewport = null;
    this.maskG = null;
    this.pad = null;
    this.focusables = [];
    this.focusIndex = null;
    this.focusRing = null;
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.row = null;
    this.host = null;
  }
}
