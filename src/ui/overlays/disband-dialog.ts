import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { disbandCost, UNIT_TYPE_NAMES } from '../../game/units/units';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind } from '@enums';

export class DisbandDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    if (s.overlay?.kind !== OverlayKind.DISBAND) return;
    const unitId = s.overlay.unitId;
    const map = gameController.getMap();
    const unit = map ? map.tiles.find((t) => t.unit?.id === unitId)?.unit : null;
    if (!unit) {
      gameController.actions.cancelDisband();
      return;
    }
    const cost = disbandCost(unit);

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.actions.confirmDisband() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.actions.cancelDisband() });
    const popup = new Popup({
      app: host.app,
      title: t('action.disbandTitle', { name: UNIT_TYPE_NAMES[unit.type] }),
      buttons: [confirm, cancel],
      onClose: () => gameController.actions.cancelDisband(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('action.disbandConfirm', { cost }));

    this.present(root, popup);
  }
}
