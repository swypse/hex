import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { tileAt } from '../../game/selection';
import { unitHelpLines, unitHelpTitle } from '../../game/unitDescriptions';
import {
  buildingHelpLines,
  buildingHelpTitle,
  buildingLimitHelpLines,
  buildingLimitHelpTitle,
  settlementHelpLines,
  settlementHelpTitle,
} from '../../game/helpTexts';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Dialog } from '../kit/dialog';
import { makeLabel } from '../kit/label';

const CARD_W = 360;
const SIDE = 24;

export class UnitHelpDialog {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

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
      default:
        if (!tile.unit) {
          this.close();
          return;
        }
        title = unitHelpTitle(tile.unit);
        lines = unitHelpLines(tile.unit);
    }
    const titleLabel = makeLabel(title, { fontSize: 20, fill: 0xffd700, fontWeight: '700' });
    const bullets = lines.map((line) =>
      makeLabel(line, { fontSize: 14, fill: 0xeeeeee, wordWrap: true, wordWrapWidth: CARD_W - SIDE * 2 }),
    );
    const close = new Button({ label: 'Close', onClick: () => this.close() });

    let cursor = SIDE;
    titleLabel.position.set(SIDE, cursor);
    cursor += titleLabel.height + 12;
    for (let i = 0; i < bullets.length; i++) {
      bullets[i]!.position.set(SIDE, cursor);
      cursor += bullets[i]!.height + 7;
    }
    cursor += 5;
    const cardH = cursor + close.height + SIDE;

    const dialog = new Dialog({
      app: host.app,
      width: CARD_W,
      height: cardH,
      onClose: () => this.close(),
      closeOnOutside: true,
    });
    dialog.card.addChild(titleLabel, close, ...bullets);
    close.position.set((CARD_W - close.width) / 2, cursor);

    root.addChild(dialog.el);
    this.el = dialog.el;

    this.onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  destroy(): void {
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    this.onKey = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
