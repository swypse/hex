import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';
import type { BuilderBuildKind } from '../../game/buildings';

const BUILD_KINDS: Array<{ kind: BuilderBuildKind; labelKey: string }> = [
  { kind: 'sawmill', labelKey: 'ui.buildsawmill10' },
  { kind: 'mine', labelKey: 'ui.buildmine15' },
  { kind: 'port', labelKey: 'ui.buildport10w302ore' },
  { kind: 'bridge', labelKey: 'ui.buildbridge10w5s15m' },
];

export class BuilderBuildDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const s = useGameStore.getState();
    if (s.overlay?.kind !== 'builderBuild') return;

    const buttons: Button[] = BUILD_KINDS.map(({ kind, labelKey }) =>
      new Button({
        label: `${t(labelKey)}`,
        onClick: () => gameController.beginBuilderPlacement(kind),
      }),
    );
    const cancel = new Button({ label: t('common.cancel'), onClick: () => s.setOverlay(null) });
    const popup = new Popup({
      app: host.app,
      title: t('action.build'),
      buttons: [...buttons, cancel],
      onClose: () => s.setOverlay(null),
      closeOnBackdrop: false,
    });

    const text = makeLabel(t('help.builder.abuild'), {
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