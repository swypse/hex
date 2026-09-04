import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { UNIT_TYPE_NAMES } from '../../game/units';
import { tileAt } from '../../game/selection';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { makeLabel } from '../kit/label';

export class ConfirmDialog {
  private el: Container | null = null;
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

    const title = makeLabel(`Attack ${owner ? `${owner.name}'s ` : ''}${UNIT_TYPE_NAMES[enemy.type]}?`, { fontSize: 16, fill: 0xffffff });
    const confirm = new Button({ label: 'Confirm', onClick: () => gameController.confirmAttack() });
    const cancel = new Button({ label: 'Cancel', onClick: () => gameController.cancelAttack() });
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
