import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { ACTION_CELL_H, ACTION_CELL_W, makeActionCircleButton, resourceCostParts } from '../kit/action-circle-button';
import { Popup } from '../kit/popup';
import { addPopupHint, PopupDialog } from './popup-dialog';
import { builderBuildStatus, BUILDING_COSTS, type BuilderBuildKind } from '../../game/economy/buildings';
import { tileAt } from '../../game/map/tile-index';
import { BRIDGE_COST } from '../../game/economy/bridges';
import { ROAD_COST } from '../../game/economy/roads';
import { type Resources } from '../../game/economy/resources';
import { BuilderBuildStatus, BuilderExtraKind, BuildingKind, FontSize, OverlayKind } from '@enums';

const COLS = 2;
const CELL_GAP = 20;
const HINT_GAP = 10;
const WIDTH = 300;

/** What a builder offers, with the base price (a discount depends on the cell chosen next). */
const BUILD_KINDS: Array<{ kind: BuilderBuildKind; nameKey: string; cost: Resources }> = [
  { kind: BuildingKind.SAWMILL, nameKey: 'building.sawmill', cost: BUILDING_COSTS.sawmill },
  { kind: BuildingKind.MINE, nameKey: 'building.mine', cost: BUILDING_COSTS.mine },
  { kind: BuildingKind.PORT, nameKey: 'building.port', cost: BUILDING_COSTS.port },
  { kind: BuilderExtraKind.BRIDGE, nameKey: 'hud.selected.bridge', cost: BRIDGE_COST },
  { kind: BuilderExtraKind.ROAD, nameKey: 'hud.selected.road', cost: ROAD_COST },
];

export class BuilderBuildDialog extends PopupDialog {
  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    if (s.overlay?.kind !== OverlayKind.BUILDER_BUILD) return;

    // Kinds the builder cannot build now (no place / not enough resources) are inert.
    const map = gameController.getMap();
    const unitTile = s.selection && map ? tileAt(map, s.selection.q, s.selection.r) : undefined;
    const player = s.players[s.localPlayerIndex];
    const statusOf = (kind: BuilderBuildKind): BuilderBuildStatus =>
      map && unitTile && player ? builderBuildStatus(map, unitTile, kind, player) : BuilderBuildStatus.AVAILABLE;

    const cancel = new Button({ label: t('common.cancel'), onClick: () => s.setOverlay(null) });
    const popup = new Popup({
      app: host.app,
      title: t('action.build'),
      width: WIDTH,
      buttons: [cancel],
      onClose: () => s.setOverlay(null),
      closeOnBackdrop: false,
    });

    const hintHeight = addPopupHint(popup, t('help.builder.abuild'));

    // The icon grid, centred under the hint.
    const gridW = COLS * ACTION_CELL_W + (COLS - 1) * CELL_GAP;
    const left = (popup.contentWidth - gridW) / 2;
    BUILD_KINDS.forEach(({ kind, nameKey, cost }, i) => {
      const item = makeActionCircleButton({
        icon: kind,
        name: t(nameKey),
        cost: resourceCostParts(cost),
        costFontSize: FontSize.VERY_SMALL,
        costIconFirst: true,
        disabled: statusOf(kind) !== BuilderBuildStatus.AVAILABLE,
        onClick: () => gameController.actions.beginBuilderPlacement(kind),
      });
      item.position.set(
        left + (i % COLS) * (ACTION_CELL_W + CELL_GAP),
        hintHeight + HINT_GAP + Math.floor(i / COLS) * (ACTION_CELL_H + CELL_GAP),
      );
      popup.content.addChild(item);
    });

    this.present(root, popup);
  }
}
