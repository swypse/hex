import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class StunChoiceDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== 'stunChoice' || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const regular = new Button({ label: t('stunChoice.attack'), onClick: () => gameController.chooseRegularAttackFromStunDialog() });
    const stun = new Button({ label: t('stunChoice.stun'), onClick: () => gameController.chooseStunFromDialog() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.cancelStun() });
    const popup = new Popup({
      app: host.app,
      title: t('stunChoice.title', { unit: UNIT_TYPE_NAMES[tile.unit.type] }),
      buttons: [regular, stun, cancel],
      onClose: () => gameController.cancelStun(),
      closeOnBackdrop: false,
    });

    const text = makeLabel(t('stunChoice.hint'), {
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