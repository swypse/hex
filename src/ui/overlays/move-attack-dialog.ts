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

export class MoveAttackDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== OverlayKind.MOVE_ATTACK || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const move = new Button({ label: t('moveAttack.move'), onClick: () => gameController.actions.chooseMoveFromDialog() });
    const attack = new Button({ label: t('moveAttack.attack'), onClick: () => gameController.actions.chooseAttackFromDialog() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.actions.cancelMoveAttack() });
    const popup = new Popup({
      app: host.app,
      title: t('moveAttack.title', { unit: UNIT_TYPE_NAMES[tile.unit.type] }),
      buttons: [move, attack, cancel],
      onClose: () => gameController.actions.cancelMoveAttack(),
      closeOnBackdrop: false,
    });

    addPopupHint(popup, t('moveAttack.hint'));

    this.present(root, popup);
  }
}