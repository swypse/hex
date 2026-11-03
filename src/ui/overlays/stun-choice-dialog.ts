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

export class StunChoiceDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== OverlayKind.STUN_CHOICE || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const regular = new Button({ label: t('stunChoice.attack'), onClick: () => gameController.actions.chooseRegularAttackFromStunDialog() });
    const stun = new Button({ label: t('stunChoice.stun'), onClick: () => gameController.actions.chooseStunFromDialog() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.actions.cancelStun() });
    const popup = new Popup({
      app: host.app,
      title: t('stunChoice.title', { unit: UNIT_TYPE_NAMES[tile.unit.type] }),
      buttons: [regular, stun, cancel],
      onClose: () => gameController.actions.cancelStun(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('stunChoice.hint'));

    this.present(root, popup);
  }
}