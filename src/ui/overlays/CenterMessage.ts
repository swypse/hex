import { Container } from 'pixi.js';
import { useGameStore } from '../../store/gameStore';
import { t } from '../../i18n';
import { type UIHost } from '../host';
import { makeLabel } from '../kit/label';
import { makeIconChip } from '../kit/tribeChip';
import { Popup, POPUP_BODY_SIZE } from '../kit/popup';

const MESSAGE_MS = 1400;
const YOUR_TURN_MS = 800;
const FORCE_CLOSE_MS = 5000;
const FONT_SIZE = POPUP_BODY_SIZE;
const ICON_CHIP_SIZE = 48;
const ICON_ICON_GAP = 6;

function messageDuration(message: string): number {
  return message === t('msg.yourTurn') ? YOUR_TURN_MS : MESSAGE_MS;
}

export class CenterMessage {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private forceTimer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;
  private current: string | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.unsub = useGameStore.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    if (!this.el || !this.host) return;
    const message = useGameStore.getState().centerMessage;
    if (message === null) {
      this.clearTimers();
      if (this.current !== null || this.popup) {
        this.popup?.destroy();
        this.popup = null;
        this.current = null;
        this.el.removeChildren().forEach((c) => c.destroy({ children: true }));
      }
      return;
    }

    const needsBuild = message !== this.current || !this.popup;
    if (needsBuild) {
      this.current = message;
      this.popup?.destroy();
      this.popup = null;
      this.el.removeChildren().forEach((c) => c.destroy({ children: true }));

      const iconFile = useGameStore.getState().centerIconFile;
      const popup = iconFile
        ? this.makeIconPopup(message)
        : new Popup({
            app: this.host.app,
            modal: false,
            interactive: false,
            fitContent: true,
            closeOnBackdrop: false,
            closeOnEscape: false,
          });
      if (iconFile) {
        this.addIconContent(popup, message, iconFile);
      } else {
        const text = makeLabel(message, {
          fontSize: FONT_SIZE,
          fill: 0xffffff,
          wordWrap: true,
          wordWrapWidth: Math.max(120, popup.contentWidth),
        });
        text.position.set(0, 0);
        popup.content.addChild(text);
      }
      this.el.addChild(popup.el);
      this.popup = popup;
      popup.finish();
      this.armForceClose();
    }

    // Always re-arm the auto-dismiss timer, even when the same message is
    // queued again, so the popup can never stay on screen forever.
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.close(), messageDuration(message));
  }

  /** A fixed-width notification card: an icon centred above the text. */
  private makeIconPopup(message: string): Popup {
    const host = this.host!;
    const probe = makeLabel(message, { fontSize: FONT_SIZE, fill: 0xffffff });
    const screenW = host.app.screen.width;
    const desired = Math.max(probe.width, ICON_CHIP_SIZE) + 8 + 40;
    return new Popup({
      app: host.app,
      modal: false,
      interactive: false,
      width: Math.min(Math.ceil(desired), Math.floor(screenW * 0.9)),
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
  }

  private addIconContent(popup: Popup, message: string, iconFile: string): void {
    const contentW = popup.contentWidth;
    const label = makeLabel(message, {
      fontSize: FONT_SIZE,
      fill: 0xffffff,
      wordWrap: true,
      wordWrapWidth: contentW,
    });
    label.anchor.set(0.5, 0);
    label.position.set(contentW / 2, ICON_CHIP_SIZE + ICON_ICON_GAP);
    popup.content.addChild(label);
    const chip = makeIconChip(iconFile, ICON_CHIP_SIZE);
    chip.position.set(contentW / 2, ICON_CHIP_SIZE / 2);
    popup.content.addChild(chip);
  }

  private armForceClose(): void {
    if (this.forceTimer) clearTimeout(this.forceTimer);
    this.forceTimer = setTimeout(() => this.forceClose(), FORCE_CLOSE_MS);
  }

  private close(): void {
    this.clearTimers();
    useGameStore.getState().setCenterMessage(null);
  }

  private forceClose(): void {
    this.clearTimers();
    this.popup?.destroy();
    this.popup = null;
    this.current = null;
    this.el?.removeChildren().forEach((c) => c.destroy({ children: true }));
    useGameStore.getState().setCenterMessage(null);
  }

  private clearTimers(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.forceTimer) {
      clearTimeout(this.forceTimer);
      this.forceTimer = null;
    }
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.clearTimers();
    if (this.unsub) this.unsub();
    this.unsub = null;
    this.popup?.destroy();
    this.popup = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
    this.current = null;
  }
}
