import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import type { BuilderBuildKind } from '../../game/economy/buildings';
import { BuilderExtraKind, BuildingKind, OverlayKind } from '@enums';

const BUILD_KINDS: Array<{ kind: BuilderBuildKind; labelKey: string }> = [
  { kind: BuildingKind.SAWMILL, labelKey: 'ui.buildsawmill10' },
  { kind: BuildingKind.MINE, labelKey: 'ui.buildmine15' },
  { kind: BuildingKind.PORT, labelKey: 'ui.buildport10w302ore' },
  { kind: BuilderExtraKind.BRIDGE, labelKey: 'ui.buildbridge10w5s15m' },
];

export class BuilderBuildDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    if (s.overlay?.kind !== OverlayKind.BUILDER_BUILD) return;

    const buttons: Button[] = BUILD_KINDS.map(({ kind, labelKey }) =>
      new Button({
        label: `${t(labelKey)}`,
        onClick: () => gameController.actions.beginBuilderPlacement(kind),
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

    addPopupHint(popup, t('help.builder.abuild'));

    this.present(root, popup);
  }
}