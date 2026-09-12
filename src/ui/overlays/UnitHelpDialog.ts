import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { tileAt } from '../../game/selection';
import { unitHelpLines, unitHelpTitle, unitHelpDescription, unitHelpStats } from '../../game/unitDescriptions';
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
import { icons16FrameForIconPath, makeIcon16 } from '../kit/icons16';
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
    if (s.overlay?.kind !== 'unitHelp' && s.overlay?.kind !== undefined) {
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
      return;
    }

    // Unit info: description, then stat icon rows, then feature bullets.
    const unit = tile.unit!;
    const desc = makeLabel(unitHelpDescription(unit), {
      fontSize: 14,
      fill: 0xeeeeee,
      wordWrap: true,
      wordWrapWidth: popup.contentWidth,
    });
    desc.position.set(0, y);
    y += desc.height + 10;
    popup.content.addChild(desc);

    const statH = 18;
    for (const stat of unitHelpStats(unit)) {
      const icon = makeIcon16(icons16FrameForIconPath(stat.icon), 16);
      icon.anchor.set(0, 0);
      icon.position.set(0, y + (statH - 16) / 2);
      const label = makeLabel(stat.text, { fontSize: 14, fill: 0xeeeeee });
      label.position.set(19, y);
      popup.content.addChild(icon, label);
      y += statH;
    }
    y += 8;

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
