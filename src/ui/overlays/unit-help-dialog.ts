import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { unitHelpLines, unitHelpTitle, unitHelpDescription, unitHelpStats } from '../../game/units/unit-descriptions';
import {
  bridgeHelpLines,
  bridgeHelpTitle,
  buildingHelpLines,
  buildingHelpTitle,
  buildingLimitHelpLines,
  buildingLimitHelpTitle,
  settlementHelpLines,
  settlementHelpTitle,
} from '../../game/help-texts';
import { hasBridge } from '../../game/economy/bridges';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../../gfx/label';
import { makeIcon } from '../kit/icon';
import { Popup } from '../kit/popup';
import { PopupDialog } from './popup-dialog';
import { FontSize, OverlayKind } from '@enums';
import { tileAt } from '../../game/map/tile-index';

export class UnitHelpDialog extends PopupDialog {
  private close(): void {
    useGameStore.getState().setOverlay(null);
  }

  mount(host: UIHost, root: Container): void {
    const s = useGameStore.getState();
    const map = gameController.getMap();
    if (!map || !s.selection) {
      this.close();
      return;
    }
    const tile = tileAt(map, s.selection.q, s.selection.r);
    if (!tile) {
      this.close();
      return;
    }
    let title: string;
    let lines: string[];
    switch (s.overlay?.kind) {
      case OverlayKind.SETTLEMENT_HELP:
        if (!tile.settlement) {
          this.close();
          return;
        }
        title = settlementHelpTitle(tile);
        lines = settlementHelpLines(map, tile);
        break;
      case OverlayKind.BUILDING_HELP:
        if (!tile.building) {
          this.close();
          return;
        }
        title = buildingHelpTitle(tile);
        lines = buildingHelpLines(map, tile);
        break;
      case OverlayKind.BUILDING_LIMIT_HELP:
        if (!tile.settlement) {
          this.close();
          return;
        }
        title = buildingLimitHelpTitle(tile);
        lines = buildingLimitHelpLines(map, tile);
        break;
      case OverlayKind.BRIDGE_HELP:
        if (!hasBridge(tile)) {
          this.close();
          return;
        }
        title = bridgeHelpTitle();
        lines = bridgeHelpLines();
        break;
      default:
        if (!tile.unit) {
          this.close();
          return;
        }
        title = unitHelpTitle(tile.unit);
        lines = unitHelpLines(tile.unit);
    }

    const close = new Button({ label: t('common.close'), onClick: () => this.close() });
    const popup = new Popup({
      app: host.app,
      title,
      buttons: [close],
      onClose: () => this.close(),
    });

    let y = 0;
    if (s.overlay?.kind !== OverlayKind.UNIT_HELP && s.overlay?.kind !== undefined) {
      for (const line of lines) {
        const bullet = makeLabel(line, {
          fontSize: FontSize.SMALL,
          fill: 0xeeeeee,
          wordWrap: true,
          wordWrapWidth: popup.contentWidth,
        });
        bullet.position.set(0, y);
        y += bullet.height + 6;
        popup.content.addChild(bullet);
      }
      this.present(root, popup);
      return;
    }

    // Unit info: description, then stat icon rows, then feature bullets.
    const unit = tile.unit!;
    const desc = makeLabel(unitHelpDescription(unit), {
      fontSize: FontSize.SMALL,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    desc.position.set(0, y);
    y += desc.height + 10;
    popup.content.addChild(desc);

    const statH = 18;
    for (const stat of unitHelpStats(unit)) {
      const icon = makeIcon(stat.icon, 16);
      icon.anchor.set(0, 0);
      icon.position.set(0, y + (statH - 16) / 2);
      const label = makeLabel(stat.text, { fontSize: FontSize.SMALL, fill: 0xeeeeee });
      label.position.set(19, y);
      popup.content.addChild(icon, label);
      y += statH;
    }
    y += 8;

    for (const line of lines) {
      const bullet = makeLabel(line, {
        fontSize: FontSize.SMALL,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: popup.contentWidth,
      });
      bullet.position.set(0, y);
      y += bullet.height + 6;
      popup.content.addChild(bullet);
    }

    this.present(root, popup);
  }
}
