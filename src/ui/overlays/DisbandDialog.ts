import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { disbandCost, UNIT_TYPE_NAMES } from '../../game/units';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class DisbandDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.overlay?.kind !== 'disband') return;
    const unitId = s.overlay.unitId;
    const map = gameController.getMap();
    const unit = map ? map.tiles.find((t) => t.unit?.id === unitId)?.unit : null;
    if (!unit) {
      gameController.cancelDisband();
      return;
    }
    const cost = disbandCost(unit);

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.confirmDisband() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.cancelDisband() });
    const popup = new Popup({
      app: host.app,
      title: t('action.disbandTitle', { name: UNIT_TYPE_NAMES[unit.type] }),
      buttons: [confirm, cancel],
      onClose: () => gameController.cancelDisband(),
      closeOnBackdrop: false,
    });

    const hint = makeLabel(t('action.disbandConfirm', { cost }), {
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
