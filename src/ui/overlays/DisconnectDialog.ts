import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { useGameStore, confirmLeaveGame } from '../../store/gameStore';
import { gameController } from '../../controller/gameController';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

/** Shown while the game is paused due to a disconnect: an in-game peer on the
 *  host (Wait / Give to AI / Forfeit) or the host for waiting clients
 *  (Waiting for host… + Leave game). */
export class DisconnectDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const isHost = s.netMode === 'host';
    const name = s.pausedName;

    let title: string;
    let hint: string;
    let buttons: Button[] = [];

    if (isHost) {
      title = t('disconnect.title');
      hint = name ? t('disconnect.hostInfo', { name }) : t('disconnect.hostInfoGeneric');
      buttons = [
        new Button({ label: t('disconnect.wait'), onClick: () => gameController.waitForDisconnected() }),
        new Button({ label: t('disconnect.giveToAI'), onClick: () => this.resolve('ai') }),
        new Button({ label: t('disconnect.forfeit'), onClick: () => this.resolve('forfeit') }),
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

    const text = makeLabel(hint, {
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

  private resolve(kind: 'ai' | 'forfeit'): void {
    if (useGameStore.getState().paused !== 'disconnect') return;
    void (kind === 'ai' ? gameController.giveDisconnectedToAI() : gameController.forfeitDisconnected());
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