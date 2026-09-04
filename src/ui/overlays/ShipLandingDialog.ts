import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class ShipLandingDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== 'shipLanding' || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.confirmShipLanding() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.cancelShipLanding() });
    const popup = new Popup({
      app: host.app,
      title: `Become a ${UNIT_TYPE_NAMES[tile.unit.type]} again?`,
      buttons: [confirm, cancel],
      onClose: () => gameController.cancelShipLanding(),
      closeOnBackdrop: false,
    });

    const text = makeLabel('Move your ship onto land to disembark.', {
      fontSize: 14,
      fill: 0xcccccc,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    text.position.set(0, 0);
    popup.content.addChild(text);

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
