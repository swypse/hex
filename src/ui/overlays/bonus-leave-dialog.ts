import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind } from '@enums';

/** Asked when a unit that can claim the bonus it stands on is sent away. */
export class BonusLeaveDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    if (useGameStore.getState().overlay?.kind !== OverlayKind.BONUS_LEAVE) return;
    const claim = new Button({ label: t('bonusLeave.claim'), onClick: () => gameController.actions.claimBonusFromDialog() });
    const leave = new Button({ label: t('bonusLeave.leave'), onClick: () => gameController.actions.chooseLeaveBonus() });
    const popup = new Popup({
      app: host.app,
      title: t('bonusLeave.title'),
      buttons: [claim, leave],
      onClose: () => gameController.actions.cancelBonusLeave(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('bonusLeave.hint'));

    this.present(root, popup);
  }
}
