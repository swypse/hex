import { Container } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { resourceTokens } from '../../game/economy/resources';
import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { Popup } from '../kit/popup';
import { PopupDialog } from './popup-dialog';
import { addTradeRow } from './trade-row';
import { ButtonStyle, FontSize, OverlayKind } from '@enums';

const WIDTH = 460;
const ROW_GAP = 10;

/** Every proposal waiting for the player's orders, each with its own Accept and Decline. */
export class TradeProposalDialog extends PopupDialog {
  private unsub: (() => void) | null = null;

  mount(host: UIHost, root: Container): void {
    const close = (): void => useGameStore.getState().setOverlay(null);
    const popup = new Popup({
      app: host.app,
      title: t('trade.proposalTitle'),
      width: WIDTH,
      buttons: [new Button({ label: t('trade.later'), onClick: close })],
      onClose: close,
      closeOnBackdrop: false,
    });
    this.present(root, popup);
    this.render();
    this.unsub = useGameStore.subscribe(() => this.render());
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    super.destroy();
  }

  private render(): void {
    const popup = this.popup;
    const sim = gameController.getSim();
    const s = useGameStore.getState();
    if (!popup || !sim || s.overlay?.kind !== OverlayKind.TRADE_PROPOSAL) return;
    const rows = sim.trading.ordersOf(s.localPlayerIndex).flatMap((order) => order.proposals.map((proposal) => ({ order, proposal })));
    if (rows.length === 0) {
      s.setOverlay(null);
      return;
    }
    popup.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    let y = 0;
    for (const { order, proposal } of rows) {
      const seller = sim.players[proposal.seller];
      const tribe = seller ? tribeById(seller.tribe) : undefined;
      y += addTradeRow(popup.content, y, popup.contentWidth, {
        value: t('trade.proposalText', {
          name: tribe?.name ?? t('ui.unknownTribe'),
          pay: resourceTokens(proposal.payment),
          items: resourceTokens({ money: 0, wood: 0, stone: 0, ore: 0, food: 0, [order.resource]: order.quantity }),
        }),
        iconKey: tribe ? `${tribe.code}-icon.png` : undefined,
        buttons: [
          new Button({ label: t('trade.accept'), style: ButtonStyle.SUCCESS, fontSize: FontSize.VERY_SMALL, disabled: !gameController.trade.canAccept(order, proposal), onClick: () => gameController.trade.accept(order.id, proposal.seller) }),
          new Button({ label: t('trade.decline'), style: ButtonStyle.WARNING, fontSize: FontSize.VERY_SMALL, onClick: () => gameController.trade.decline(order.id, proposal.seller) }),
        ],
      }) + ROW_GAP;
    }
    popup.reflow();
  }
}
