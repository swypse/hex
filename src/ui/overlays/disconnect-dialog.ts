import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { useGameStore, confirmLeaveGame } from '../../store/game-store';
import { gameController } from '../../controller/game-controller';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { DisconnectChoice, NetMode, PauseReason } from '@enums';

/** Shown while the game is paused due to a disconnect: an in-game peer on the
 *  host (Wait / Give to AI / Forfeit) or the host for waiting clients
 *  (Waiting for host… + Leave game). */
export class DisconnectDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const isHost = s.netMode === NetMode.HOST;
    const name = s.pausedName;

    let title: string;
    let hint: string;
    let buttons: Button[] = [];

    if (isHost) {
      title = t('disconnect.title');
      hint = name ? t('disconnect.hostInfo', { name }) : t('disconnect.hostInfoGeneric');
      buttons = [
        new Button({ label: t('disconnect.wait'), onClick: () => gameController.waitForDisconnected() }),
        new Button({ label: t('disconnect.giveToAI'), onClick: () => this.resolve(DisconnectChoice.AI) }),
        new Button({ label: t('disconnect.forfeit'), onClick: () => this.resolve(DisconnectChoice.FORFEIT) }),
      ];
    } else {
      title = t('disconnect.waitingTitle');
      hint = t('disconnect.clientHint');
      buttons = [
        new Button({ label: t('disconnect.leave'), onClick: () => confirmLeaveGame() }),
      ];
    }

    const popup = new Popup({
      app: host.app,
      title,
      buttons,
      onClose: () => {
        // Escape/backdrop close: for the host keep waiting, for the client
        // nothing happens; closeOnBackdrop stays off so this is only Escape.
      },
      closeOnBackdrop: false,
      closeOnEscape: false,
    });

    addPopupHint(popup, hint);

    this.present(root, popup);
  }

  private resolve(kind: DisconnectChoice): void {
    if (useGameStore.getState().paused !== PauseReason.DISCONNECT) return;
    void (kind === DisconnectChoice.AI ? gameController.giveDisconnectedToAI() : gameController.forfeitDisconnected());
  }
}