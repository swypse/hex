import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class ConfirmDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map || s.overlay?.kind !== 'confirm') return;
    const tile = tileAt(map, s.overlay.target.q, s.overlay.target.r);
    if (!tile || !tile.unit) return;
    const enemy = tile.unit;
    const owner = enemy.owner >= 0 ? s.players[enemy.owner] : null;
    const tribe = owner ? TRIBES.find((t) => t.id === owner.tribe) : null;

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.confirmAttack() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.cancelAttack() });
    const popup = new Popup({
      app: host.app,
      title: `Attack ${owner ? `${owner.name}'s ` : ''}${UNIT_TYPE_NAMES[enemy.type]}?`,
      buttons: [confirm, cancel],
      onClose: () => gameController.cancelAttack(),
      closeOnBackdrop: false,
    });

    const hint = makeLabel(tribe ? `${tribe.name} unit — confirm the attack?` : 'Confirm the attack?', {
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
