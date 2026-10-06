import type { Container } from 'pixi.js';
import { FontSize } from '@enums';
import { type UIHost } from '../host';
import { makeLabel } from '../../gfx/label';
import { Popup } from '../kit/popup';

/** Wrapped grey hint text at the top of a popup body. */
export function addPopupHint(popup: Popup, text: string): void {
  const label = makeLabel(text, {
    fontSize: FontSize.SMALL,
    fill: 0xcccccc,
    wordWrap: true,
    wordWrapWidth: popup.contentWidth,
  });
  label.position.set(0, 0);
  popup.content.addChild(label);
}

/** Base of the overlays that are a single Popup: owns it, plays its hide
 *  animation and destroys it. */
export abstract class PopupDialog {
  protected popup: Popup | null = null;

  abstract mount(host: UIHost, root: Container): void;

  /** Puts the finished popup on screen and keeps it for hide/destroy. */
  protected present(root: Container, popup: Popup): void {
    root.addChild(popup.el);
    this.popup = popup;
    popup.finish();
  }

  hide(onDone: () => void): void {
    if (this.popup) this.popup.animateOut(onDone);
    else onDone();
  }

  destroy(): void {
    this.popup?.destroy();
    this.popup = null;
  }
}
