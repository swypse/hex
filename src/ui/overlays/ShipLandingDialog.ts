import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { makeLabel } from '../kit/label';

export class ShipLandingDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || s.overlay?.kind !== 'shipLanding' || !selection) return;
    const tile = tileAt(map, selection.q, selection.r);
    if (!tile || !tile.unit) return;

    const title = makeLabel(`Move to land and become a ${UNIT_TYPE_NAMES[tile.unit.type]} again?`, { fontSize: 16, fill: 0xffffff });
    const confirm = new Button({ label: 'Confirm', onClick: () => gameController.confirmShipLanding() });
    const cancel = new Button({ label: 'Cancel', onClick: () => gameController.cancelShipLanding() });
    const w = Math.max(title.width, confirm.width + cancel.width + 8) + 32;
    const h = 16 + title.height + 12 + 34 + 16;

    const dialog = new Dialog({ app: host.app, width: w, height: h, closeOnOutside: false, onClose: () => {} });
    title.position.set(w / 2 - title.width / 2, 16);
    confirm.position.set(w / 2 - confirm.width - 4, 16 + title.height + 12);
    cancel.position.set(w / 2 + 4, 16 + title.height + 12);
    dialog.card.addChild(title, confirm, cancel);

    root.addChild(dialog.el);
    this.el = dialog.el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
