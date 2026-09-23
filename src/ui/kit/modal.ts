import { t } from '../../i18n';
import { Application, Container } from 'pixi.js';
import { Button } from './button';
import { makeLabel } from './label';
import { Popup } from './popup';

interface ModalOpts {
  app: Application;
  title: string;
  lines: string[];
  /** Content rendered beneath the lines (e.g. a checkbox row). */
  extra?: Container;
  onClose: () => void;
  closeOnEnter?: boolean;
}

const BODY_SIZE = 14;
const BODY_COLOR = 0xcccccc;
const LINE_GAP = 6;

export class Modal {
  private popup: Popup | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(opts: ModalOpts) {
    const close = new Button({ label: t('common.close'), width: 140, onClick: opts.onClose });
    const popup = new Popup({
      app: opts.app,
      title: opts.title,
      buttons: [close],
      onClose: opts.onClose,
      closeOnBackdrop: true,
      closeOnEscape: false,
    });

    let y = 0;
    for (const line of opts.lines) {
      const label = makeLabel(line, {
        fontSize: BODY_SIZE,
        fill: BODY_COLOR,
        wordWrap: true,
        wordWrapWidth: popup.contentWidth,
      });
      label.position.set(0, y);
      y += label.height + LINE_GAP;
      popup.content.addChild(label);
    }
    if (opts.extra) {
      opts.extra.position.set(0, y + LINE_GAP);
      popup.content.addChild(opts.extra);
    }

    this.popup = popup;
    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || (opts.closeOnEnter && e.key === 'Enter')) {
        e.preventDefault();
        opts.onClose();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  mount(container: { addChild(child: unknown): void }): void {
    if (!this.popup) return;
    container.addChild(this.popup.el);
    this.popup.finish();
  }

  /** Play the hide animation; the caller should destroy afterwards. */
  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.popup?.destroy();
    this.popup = null;
  }
}
