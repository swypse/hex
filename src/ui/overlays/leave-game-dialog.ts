import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { cancelLeaveGame, confirmLeaveGame } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';

export class LeaveGameDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const leave = new Button({ label: t('ui.leave'), onClick: () => confirmLeaveGame() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => cancelLeaveGame() });
    const popup = new Popup({
      app: host.app,
      title: t('leave.title'),
      buttons: [leave, cancel],
      onClose: () => cancelLeaveGame(),
    });

    addPopupHint(popup, t('leave.hint'));

    this.present(root, popup);
  }
}
