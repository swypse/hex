import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind } from '@enums';

export class StalkerRevealDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const selection = s.selection;
    if (!gameController.getMap() || s.overlay?.kind !== OverlayKind.STALKER_REVEAL || !selection) return;

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.actions.confirmStalkerApproach() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.actions.cancelStalkerApproach() });
    const popup = new Popup({
      app: host.app,
      title: t('stalkerReveal.title'),
      buttons: [confirm, cancel],
      onClose: () => gameController.actions.cancelStalkerApproach(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('stalkerReveal.hint'));

    this.present(root, popup);
  }
}