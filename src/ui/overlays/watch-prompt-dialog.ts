import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class WatchPromptDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const watch = new Button({ label: t('watch.watch'), width: 180, onClick: () => gameController.watchGame() });
    const finish = new Button({ label: t('watch.finish'), width: 180, onClick: () => gameController.finishGameNow() });
    const popup = new Popup({
      app: host.app,
      title: t('watch.title'),
      buttons: [watch, finish],
      closeOnBackdrop: false,
      closeOnEscape: false,
    });

    const hint = makeLabel(t('watch.body'), {
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