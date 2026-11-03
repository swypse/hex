import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { UNIT_TYPE_NAMES } from '../../game/units/units';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind } from '@enums';
import { tileAt } from '../../game/map/tile-index';

export class ShipLandingDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== OverlayKind.SHIP_LANDING || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.actions.confirmShipLanding() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.actions.cancelShipLanding() });
    const popup = new Popup({
      app: host.app,
      title: t('shipLanding.title', { unit: UNIT_TYPE_NAMES[tile.unit.type] }),
      buttons: [confirm, cancel],
      onClose: () => gameController.actions.cancelShipLanding(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('shipLanding.hint'));

    this.present(root, popup);
  }
}
