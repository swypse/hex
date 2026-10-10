import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { VETERAN_ATTACK_BONUS, VETERAN_HP_BONUS, VETERAN_MOVE_BONUS } from '../../game/units/units';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind, VeteranBonus } from '@enums';

/** Asked when a unit scores its 3rd kill: the owner picks the veteran's permanent bonus. Cannot be dismissed. */
export class VeteranBonusDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const overlay = useGameStore.getState().overlay;
    if (overlay?.kind !== OverlayKind.VETERAN_BONUS) return;
    const choose = (bonus: VeteranBonus) => () => gameController.actions.chooseVeteranBonus(overlay.unitId, bonus);
    const popup = new Popup({
      app: host.app,
      title: t('veteran.title'),
      buttons: [
        new Button({ icon: 'attack-32', label: `+${VETERAN_ATTACK_BONUS}`, onClick: choose(VeteranBonus.ATTACK) }),
        new Button({ icon: 'hp-32', label: `+${VETERAN_HP_BONUS}`, onClick: choose(VeteranBonus.HP) }),
        new Button({ icon: 'move-32', label: `+${VETERAN_MOVE_BONUS}`, onClick: choose(VeteranBonus.MOVE) }),
      ],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    addPopupHint(popup, t('veteran.hint'));
    this.present(root, popup);
  }
}
