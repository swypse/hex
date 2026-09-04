import { Container } from 'pixi.js';
import { cancelLeaveGame, confirmLeaveGame } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { makeLabel } from '../kit/label';

export class LeaveGameDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const title = makeLabel('Are you sure?', { fontSize: 20, fill: 0xffffff, fontWeight: '700' });
    const hint = makeLabel('The current game will be abandoned.', { fontSize: 13, fill: 0xcccccc });
    const leave = new Button({ label: 'Leave', onClick: () => confirmLeaveGame() });
    const cancel = new Button({ label: 'Cancel', onClick: () => cancelLeaveGame() });
    const rowW = leave.width + cancel.width + 12;
    const w = Math.max(title.width, hint.width, rowW) + 32;
    const h = 24 + title.height + 8 + hint.height + 18 + 34 + 20;

    const dialog = new Dialog({ app: host.app, width: w, height: h, onClose: () => cancelLeaveGame() });
    title.position.set(w / 2 - title.width / 2, 24);
    hint.position.set(w / 2 - hint.width / 2, 24 + title.height + 8);
    leave.position.set(w / 2 - leave.width - 6, 24 + title.height + 8 + hint.height + 18);
    cancel.position.set(w / 2 + 6, 24 + title.height + 8 + hint.height + 18);
    dialog.card.addChild(title, hint, leave, cancel);

    root.addChild(dialog.el);
    this.el = dialog.el;
  }

  destroy(): void {
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
