import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class StalkerRevealDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    const selection = s.selection;
    if (!gameController.getMap() || s.overlay?.kind !== 'stalkerReveal' || !selection) return;

    const confirm = new Button({ label: t('common.confirm'), onClick: () => gameController.confirmStalkerApproach() });
    const cancel = new Button({ label: t('common.cancel'), onClick: () => gameController.cancelStalkerApproach() });
    const popup = new Popup({
      app: host.app,
      title: t('stalkerReveal.title'),
      buttons: [confirm, cancel],
      onClose: () => gameController.cancelStalkerApproach(),
      closeOnBackdrop: false,
    });

    const text = makeLabel(t('stalkerReveal.hint'), {
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