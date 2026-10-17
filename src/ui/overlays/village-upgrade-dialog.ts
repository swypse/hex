import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { UPGRADE_MONEY_BONUS, villageUpgradeChoices } from '../../game/economy/village';
import { tileAt } from '../../game/map/tile-index';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { OverlayKind, VillageUpgradeBonus } from '@enums';

const LABELS: Record<VillageUpgradeBonus, () => string> = {
  [VillageUpgradeBonus.EXPAND_TERRITORY]: () => t('villageUpgrade.expand'),
  [VillageUpgradeBonus.MONEY]: () => t('villageUpgrade.money', { money: UPGRADE_MONEY_BONUS }),
  [VillageUpgradeBonus.INCOME]: () => t('villageUpgrade.income'),
  [VillageUpgradeBonus.VETERAN_SWORDSMAN]: () => t('villageUpgrade.swordsman'),
};

/** Choice of the bonus a village upgrade grants (levels 5, 9 and 10+). */
export class VillageUpgradeDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map || s.overlay?.kind !== OverlayKind.VILLAGE_UPGRADE) return;
    const tile = tileAt(map, s.overlay.q, s.overlay.r);
    const level = tile?.settlement?.level;
    if (!tile || level === undefined) return;
    const close = (): void => useGameStore.getState().setOverlay(null);
    const choices = villageUpgradeChoices(level);
    const buttons = [
      ...choices.map((bonus) => new Button({ label: LABELS[bonus](), onClick: () => gameController.actions.upgradeSelectedVillage(bonus) })),
      new Button({ label: t('common.cancel'), onClick: close }),
    ];
    const popup = new Popup({
      app: host.app,
      title: t('villageUpgrade.title', { level: level + 1 }),
      buttons,
      onClose: close,
      closeOnBackdrop: false,
    });
    addPopupHint(popup, choices.includes(VillageUpgradeBonus.VETERAN_SWORDSMAN) ? t('villageUpgrade.hintSwordsman') : t('villageUpgrade.hint'));
    this.present(root, popup);
  }
}
