import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';

export class WatchPromptDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const watch = new Button({ label: t('watch.watch'), width: 180, onClick: () => gameController.watchGame() });
    const finish = new Button({ label: t('watch.finish'), width: 180, onClick: () => gameController.finishGameNow() });
    const popup = new Popup({
      app: host.app,
      title: t('watch.title'),
      buttons: [watch, finish],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });

    addPopupHint(popup, t('watch.body'));

    this.present(root, popup);
  }
}