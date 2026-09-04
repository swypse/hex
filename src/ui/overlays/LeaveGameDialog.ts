import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { cancelLeaveGame, confirmLeaveGame } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class LeaveGameDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const leave = new Button({ label: t('ui.leave'), onClick: () => confirmLeaveGame() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => cancelLeaveGame() });
    const popup = new Popup({
      app: host.app,
      title: t('leave.title'),
      buttons: [leave, cancel],
      onClose: () => cancelLeaveGame(),
    });

    const hint = makeLabel(t('leave.hint'), {
      fontSize: 14,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    hint.position.set(0, 0);
    popup.content.addChild(hint);

    root.addChild(popup.el);
    this.el = popup.el;
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
    this.el = null;
    this.host = null;
  }
}
