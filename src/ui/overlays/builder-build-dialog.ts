import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { BUILDING_COSTS, type BuilderBuildKind } from '../../game/economy/buildings';
import { BRIDGE_COST } from '../../game/economy/bridges';
import { costLabel, type Resources } from '../../game/economy/resources';
import { BuilderExtraKind, BuildingKind, OverlayKind } from '@enums';

/** What a builder offers, with the base price (a discount depends on the cell chosen next). */
const BUILD_KINDS: Array<{ kind: BuilderBuildKind; labelKey: string; cost: Resources }> = [
  { kind: BuildingKind.SAWMILL, labelKey: 'build.sawmill', cost: BUILDING_COSTS.sawmill },
  { kind: BuildingKind.MINE, labelKey: 'build.mine', cost: BUILDING_COSTS.mine },
  { kind: BuildingKind.PORT, labelKey: 'build.port', cost: BUILDING_COSTS.port },
  { kind: BuilderExtraKind.BRIDGE, labelKey: 'build.bridge', cost: BRIDGE_COST },
];

export class BuilderBuildDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    if (s.overlay?.kind !== OverlayKind.BUILDER_BUILD) return;

    const buttons: Button[] = BUILD_KINDS.map(({ kind, labelKey, cost }) =>
      new Button({
        label: t(labelKey, { cost: costLabel(cost) }),
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