import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { tileAt } from '../../game/selection';
import { unitHelpLines, unitHelpTitle } from '../../game/unitDescriptions';
import {
  bridgeHelpLines,
  bridgeHelpTitle,
  buildingHelpLines,
  buildingHelpTitle,
  buildingLimitHelpLines,
  buildingLimitHelpTitle,
  settlementHelpLines,
  settlementHelpTitle,
} from '../../game/helpTexts';
import { hasBridge } from '../../game/bridges';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

export class UnitHelpDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;

  private close(): void {
    useGameStore.getState().setOverlay(null);
  }

  mount(host: UIHost, root: Container): void {
    this.host = host;
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
      case 'settlementHelp':
        if (!tile.settlement) {
          this.close();
          return;
        }
        title = settlementHelpTitle(tile);
        lines = settlementHelpLines(map, tile);
        break;
      case 'buildingHelp':
        if (!tile.building) {
          this.close();
          return;
        }
        title = buildingHelpTitle(tile);
        lines = buildingHelpLines(map, tile);
        break;
      case 'buildingLimitHelp':
        if (!tile.settlement) {
          this.close();
          return;
        }
        title = buildingLimitHelpTitle(tile);
        lines = buildingLimitHelpLines(map, tile);
        break;
      case 'bridgeHelp':
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
    for (const line of lines) {
      const bullet = makeLabel(line, {
        fontSize: 14,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: popup.contentWidth,
      });
      bullet.position.set(0, y);
      y += bullet.height + 6;
      popup.content.addChild(bullet);
    }

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
