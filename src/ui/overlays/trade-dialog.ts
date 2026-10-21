import { Circle, Container, Graphics } from 'pixi.js';
import { t } from '../../i18n';
import { gameController } from '../../controller/game-controller';
import { BODY_LINE_HEIGHT, makeLabel } from '../../gfx/label';
import type { GameMap, MapTile } from '../../game/map/map-gen';
import { foodNetworks, readStock } from '../../game/economy/stock';
import { type Resources, resourceTokens } from '../../game/economy/resources';
import {
  goodsValue, MAX_OPEN_ORDERS, MAX_ORDER_QUANTITY, orderFee, type Order, PRICE_CEILING, PRICE_FLOOR, paymentValue, priceInRange, type Proposal,
} from '../../game/trade';
import { tribeById } from '../../game/tribes';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { Popup } from '../kit/popup';
import { makeRichLabel } from '../kit/rich-label';
import { PopupDialog } from './popup-dialog';
import { addTradeRow, TRIBE_ICON_SIZE } from './trade-row';
import { ButtonStyle, FontSize, ResourceKind } from '@enums';

const WIDTH = 460;
const ROW_GAP = 10;
const BTN_GAP = 6;
/** Space above and below the payment steppers. */
const PICKER_MARGIN = 20;
/** Vertical padding of a selectable village row's background, and its selected colour. */
const ROW_PAD = 4;
const SELECTED_ROW = 0x5297ff;
/** Gap between the "Value N" and "(allowed ...)" parts. */
const VALUE_GAP = 10;
const KINDS = Object.values(ResourceKind);

const RESOURCE_ICONS: Record<ResourceKind, string> = {
  [ResourceKind.MONEY]: 'gold-32',
  [ResourceKind.WOOD]: 'wood-32',
  [ResourceKind.STONE]: 'stone-32',
  [ResourceKind.ORE]: 'ore-32',
  [ResourceKind.FOOD]: 'food-32',
};
const CIRCLE_RADIUS = 22;
const CIRCLE_GAP = 8;
/** Width reserved for an amount between the - and + buttons (three digits), so all steppers are equally wide. */
const AMOUNT_WIDTH = 44;
const STEPPER_ICON_SIZE = 28;
const SELECTED_STROKE = 0xffd27a;
const SELECTED_STROKE_WIDTH = 3;

/** Rich-label token: amount with the resource icon. */
const tok = (kind: ResourceKind, n: number): string => `[${kind}:${n}]`;

/** A round resource button (the icon alone); the selected one has a bright stroke. */
function resourceCircle(kind: ResourceKind, selected: boolean, onClick: () => void): Container {
  const item = new Container();
  item.eventMode = 'static';
  item.cursor = 'pointer';
  const r = CIRCLE_RADIUS;
  item.hitArea = new Circle(r, r, r);
  const icon = makeIcon(RESOURCE_ICONS[kind], r * 1.2);
  icon.anchor.set(0.5);
  icon.position.set(r, r);
  item.addChild(icon);
  if (selected) {
    // Drawn inside the circle's edge so the button keeps its size.
    const ring = new Graphics();
    ring.circle(r, r, r - SELECTED_STROKE_WIDTH / 2).stroke({ width: SELECTED_STROKE_WIDTH, color: SELECTED_STROKE });
    item.addChild(ring);
  }
  item.on('pointertap', onClick);
  return item;
}

/** `[icon] [-] amount [+]` (the icon is optional); the amount block has a fixed width. */
function makeStepper(opts: { icon?: ResourceKind; value: number; onMinus: () => void; onPlus: () => void }): Container {
  const el = new Container();
  const small = (label: string, onClick: () => void): Button => new Button({ label, onClick, fontSize: FontSize.VERY_SMALL });
  const minus = small('-', opts.onMinus);
  const plus = small('+', opts.onPlus);
  const h = Math.max(minus.height, STEPPER_ICON_SIZE);
  let x = 0;
  if (opts.icon) {
    const icon = makeIcon(RESOURCE_ICONS[opts.icon], STEPPER_ICON_SIZE);
    icon.position.set(STEPPER_ICON_SIZE / 2, h / 2);
    el.addChild(icon);
    x += STEPPER_ICON_SIZE + BTN_GAP;
  }
  minus.position.set(x, (h - minus.height) / 2);
  x += minus.width + BTN_GAP;
  const amount = makeLabel(String(opts.value), { fontSize: FontSize.NORMAL, fill: 0xffffff });
  amount.anchor.set(0.5, 0.5);
  amount.position.set(x + AMOUNT_WIDTH / 2, h / 2);
  x += AMOUNT_WIDTH + BTN_GAP;
  plus.position.set(x, (h - plus.height) / 2);
  el.addChild(minus, amount, plus);
  return el;
}

/** The owner's villages grouped by road/port network, each group by level (highest first), the group with the highest village first. */
function villageGroups(map: GameMap, owner: number): MapTile[][] {
  const level = (v: MapTile): number => v.settlement?.level ?? 0;
  const groups = foodNetworks(map, owner).map((n) => [...n].sort((a, b) => level(b) - level(a)));
  return groups.sort((a, b) => level(b[0]!) - level(a[0]!));
}

/** The village picked by `at`, else the capital, else the first village. */
function pickVillage(groups: MapTile[][], at: { q: number; r: number } | null | undefined): MapTile | undefined {
  const all = groups.flat();
  return all.find((v) => v.q === at?.q && v.r === at?.r) ?? all.find((v) => v.settlement?.capital) ?? all[0];
}

function villageName(village: MapTile): string {
  return village.settlement?.name ?? `${village.q},${village.r}`;
}

function emptyPayment(): Resources {
  return { wood: 0, stone: 0, money: 0, ore: 0, food: 0 };
}

export const paymentText = resourceTokens;

/** Orders, proposals and the market: place an order, answer others' orders, accept a proposal. */
export class TradeDialog extends PopupDialog {
  private unsub: (() => void) | null = null;
  private resource: ResourceKind = ResourceKind.STONE;
  private quantity = 5;
  /** The proposal form being filled in, if any. */
  private draft: { orderId: number; payment: Resources; village: { q: number; r: number } | null } | null = null;
  /** Village the next order delivers to (unset or lost: the first village, the capital). */
  private deliverTo: { q: number; r: number } | null = null;
  /** The new-order form is shown (else only the Place order button). */
  private orderFormOpen = false;

  mount(host: UIHost, root: Container): void {
    const close = (): void => useGameStore.getState().setOverlay(null);
    const popup = new Popup({
      app: host.app,
      title: t('trade.title'),
      width: WIDTH,
      // No backdrop and no blocking: the map can still be panned and zoomed behind the market.
      modal: false,
      closeOnBackdrop: false,
      buttons: [new Button({ label: t('common.close'), onClick: close })],
      onClose: close,
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
    if (!popup || !sim) return;
    popup.content.removeChildren().forEach((c) => c.destroy({ children: true }));
    const local = s.players[s.localPlayerIndex];
    const myTurn = !!local && s.currentPlayerIndex === local.index && !s.aiActive && !s.gameOver;
    const cw = popup.contentWidth;
    let y = 0;

    const text = (value: string, fill = 0xffffff): void => {
      const label = makeRichLabel(value, { fontSize: FontSize.SMALL, fill, width: cw });
      label.position.set(0, y);
      popup.content.addChild(label);
      y += label.height + ROW_GAP;
    };
    const plain = (value: string, fill = 0xffffff): void => {
      const label = makeLabel(value, { fontSize: FontSize.SMALL, fill, lineHeight: BODY_LINE_HEIGHT, wordWrap: true, wordWrapWidth: cw });
      label.position.set(0, y);
      popup.content.addChild(label);
      y += label.height + ROW_GAP;
    };
    const heading = (value: string): void => plain(value, 0xffd27a);
    const btn = (label: string, onClick: () => void, disabled = false, style?: ButtonStyle): Button =>
      new Button({ label, onClick, disabled, style, fontSize: FontSize.VERY_SMALL });
    /** A line of text with buttons aligned to its right, optionally the tribe icon of a player before it and a second, grey line below the text. */
    const row = (value: string, buttons: Button[], tribeOf?: number, second?: string, iconName?: string): void => {
      const tribe = tribeOf === undefined ? undefined : tribeById(s.players[tribeOf]?.tribe ?? -1);
      y += addTradeRow(popup.content, y, cw, { value, buttons, iconKey: tribe ? `${tribe.code}-icon.png` : iconName, second }) + ROW_GAP;
    };
    /** Adds a block horizontally centred as its own row. */
    const place = (el: Container): void => {
      el.position.set((cw - el.width) / 2, y);
      popup.content.addChild(el);
      y += el.height + ROW_GAP;
    };
    const nameOf = (index: number): string => {
      const p = s.players[index];
      const tribe = p ? tribeById(p.tribe) : undefined;
      return tribe?.name ?? t('ui.unknownTribe');
    };

    /** The player's villages as rows `Name [stock] [Select]`, one block per road/port network; returns the selected village. */
    const villageList = (selected: MapTile | undefined, onSelect: (v: MapTile) => void): MapTile | undefined => {
      villageGroups(sim.map, s.localPlayerIndex).forEach((group, i) => {
        if (i > 0) {
          const line = new Graphics().rect(0, 0, cw, 1).fill({ color: 0xffffff, alpha: 0.12 });
          line.position.set(0, y);
          popup.content.addChild(line);
          y += ROW_GAP;
        }
        for (const v of group) {
          const stock = readStock(v);
          const chosen = v === selected;
          const y0 = y;
          const at = popup.content.children.length;
          row(`${villageName(v)} ${resourceTokens({ money: 0, wood: stock.wood, stone: stock.stone, ore: stock.ore, food: stock.food })}`, [], undefined, undefined, 'village-32');
          // The whole row is the button: a background behind it marks the selected village.
          const bg = new Graphics();
          const rowH = y - ROW_GAP - y0;
          // Never fully transparent, so the row still takes clicks.
          const draw = (alpha: number): void => {
            bg.clear().roundRect(0, y0 - ROW_PAD, cw, rowH + ROW_PAD * 2, 6).fill({ color: chosen ? SELECTED_ROW : 0xffffff, alpha: Math.max(alpha, 0.001) });
          };
          draw(chosen ? 0.35 : 0);
          bg.eventMode = 'static';
          bg.cursor = chosen ? 'default' : 'pointer';
          if (!chosen) {
            bg.on('pointerover', () => draw(0.1));
            bg.on('pointerout', () => draw(0));
            bg.on('pointertap', () => onSelect(v));
          }
          popup.content.addChildAt(bg, at);
        }
      });
      return selected;
    };

    if (!local) return;
    const mine = sim.trading.ordersOf(local.index);

    if (this.draft) {
      this.renderDraft(popup, text, row, place, (px) => { y += px; }, plain, villageList, btn, sim.trading.state.orders.find((o) => o.id === this.draft!.orderId), nameOf);
      popup.reflow();
      return;
    }

    // The new-order form replaces the whole dialog until Post order or Cancel.
    if (this.orderFormOpen && mine.length < MAX_OPEN_ORDERS) {
      heading(t('trade.placeOrder'));
      const fee = orderFee(local);
      // One centred line: [-] N [+] and the resource circles; two lines when the popup is too narrow.
      const stepper = makeStepper({
        value: this.quantity,
        onMinus: () => { this.quantity = Math.max(1, this.quantity - 1); this.render(); },
        onPlus: () => { this.quantity = Math.min(MAX_ORDER_QUANTITY, this.quantity + 1); this.render(); },
      });
      const circles = new Container();
      KINDS.forEach((k, i) => {
        const c = resourceCircle(k, k === this.resource, () => { this.resource = k; this.render(); });
        c.position.set(i * (CIRCLE_RADIUS * 2 + CIRCLE_GAP), 0);
        circles.addChild(c);
      });
      const h = CIRCLE_RADIUS * 2;
      const gap = CIRCLE_GAP * 1.5;
      if (stepper.width + gap + circles.width <= cw) {
        const line = new Container();
        stepper.y = (h - stepper.height) / 2;
        circles.x = stepper.width + gap;
        line.addChild(stepper, circles);
        place(line);
      } else {
        place(stepper);
        place(circles);
      }
      // Village that receives the goods.
      plain(t('trade.deliverTo'), 0xcccccc);
      const target = villageList(pickVillage(villageGroups(sim.map, local.index), this.deliverTo), (v) => { this.deliverTo = { q: v.q, r: v.r }; this.render(); });
      y += PICKER_MARGIN - ROW_GAP;
      const buttons = new Container();
      const post = new Button({
        label: t('trade.placeOrder'),
        suffix: { icon: 'gold-32', text: String(fee) },
        fontSize: FontSize.VERY_SMALL,
        disabled: !myTurn || local.resources.money < fee,
        onClick: () => { this.orderFormOpen = false; gameController.trade.placeOrder(this.resource, this.quantity, target ? { q: target.q, r: target.r } : undefined); },
      });
      const cancel = btn(t('common.cancel'), () => { this.orderFormOpen = false; this.render(); });
      cancel.x = post.width + BTN_GAP;
      buttons.addChild(post, cancel);
      place(buttons);
      popup.reflow();
      return;
    }

    heading(t('trade.myOrder'));
    for (const order of mine) {
      const target = sim.map.tiles.find((v) => v.q === order.deliverTo.q && v.r === order.deliverTo.r);
      row(
        t('trade.orderLine', { items: tok(order.resource, order.quantity) }),
        myTurn ? [btn(t('trade.cancelOrder'), () => gameController.trade.cancelOrder(order.id))] : [],
        undefined,
        t('trade.deliverLine', { village: target ? villageName(target) : '?' }),
      );
      if (order.proposals.length === 0) text(t('trade.noProposals'), 0xcccccc);
      for (const p of order.proposals) this.proposalRow(row, btn, order, p, nameOf, myTurn);
    }
    if (mine.length < MAX_OPEN_ORDERS) {
      const fee = orderFee(local);
      place(new Button({
        label: t('trade.placeOrder'),
        suffix: { icon: 'gold-32', text: String(fee) },
        fontSize: FontSize.VERY_SMALL,
        disabled: !myTurn || local.resources.money < fee,
        onClick: () => { this.orderFormOpen = true; this.render(); },
      }));
    }

    heading(t('trade.market'));
    const orders = sim.trading.visibleOrders(local);
    if (orders.length === 0) text(t('trade.marketEmpty'), 0xcccccc);
    for (const o of orders) {
      const own = o.proposals.find((p) => p.seller === local.index);
      const line = t('trade.marketLine', { name: nameOf(o.buyer), items: tok(o.resource, o.quantity) });
      if (own) {
        row(line, myTurn ? [btn(t('trade.withdraw'), () => gameController.trade.withdraw(o.id))] : [], o.buyer, t('trade.youPropose', { pay: paymentText(own.payment) }));
      } else {
        row(line, [btn(t('trade.propose'), () => { this.draft = { orderId: o.id, payment: emptyPayment(), village: null }; this.render(); }, !myTurn)], o.buyer);
      }
    }
    popup.reflow();
  }

  private proposalRow(
    row: (value: string, buttons: Button[]) => void,
    btn: (label: string, onClick: () => void, disabled?: boolean, style?: ButtonStyle) => Button,
    order: Order,
    p: Proposal,
    nameOf: (i: number) => string,
    canAct: boolean,
  ): void {
    const affordable = gameController.trade.canAccept(order, p);
    row(t('trade.proposalLine', { name: nameOf(p.seller), pay: paymentText(p.payment) }), canAct
      ? [btn(t('trade.accept'), () => gameController.trade.accept(order.id, p.seller), !affordable, ButtonStyle.SUCCESS), btn(t('trade.decline'), () => gameController.trade.decline(order.id, p.seller), false, ButtonStyle.WARNING)]
      : []);
  }

  private renderDraft(
    popup: Popup,
    text: (v: string, fill?: number) => void,
    row: (v: string, b: Button[], tribeOf?: number) => void,
    place: (el: Container) => void,
    space: (px: number) => void,
    plain: (v: string, fill?: number) => void,
    villageList: (selected: MapTile | undefined, onSelect: (v: MapTile) => void) => MapTile | undefined,
    btn: (label: string, onClick: () => void, disabled?: boolean, style?: ButtonStyle) => Button,
    order: Order | undefined,
    nameOf: (i: number) => string,
  ): void {
    const draft = this.draft!;
    if (!order) {
      this.draft = null;
      this.render();
      return;
    }
    // Centred first line: tribe icon and tribe name.
    const header = new Container();
    const tribe = tribeById(useGameStore.getState().players[order.buyer]?.tribe ?? -1);
    if (tribe) {
      const icon = makeIcon(`${tribe.code}-icon.png`, TRIBE_ICON_SIZE);
      icon.position.set(TRIBE_ICON_SIZE / 2, TRIBE_ICON_SIZE / 2);
      header.addChild(icon);
    }
    const needs = makeRichLabel(nameOf(order.buyer), { fontSize: FontSize.SMALL, fill: 0xffffff, width: popup.contentWidth });
    needs.position.set(tribe ? TRIBE_ICON_SIZE + BTN_GAP : 0, (TRIBE_ICON_SIZE - needs.height) / 2);
    header.addChild(needs);
    place(header);
    place(makeRichLabel(t('trade.youGive', { items: tok(order.resource, order.quantity) }), { fontSize: FontSize.SMALL, fill: 0xcccccc, width: popup.contentWidth }));
    space(PICKER_MARGIN - ROW_GAP);
    for (const k of KINDS.filter((kind) => kind !== order.resource)) {
      const stepper = makeStepper({
        icon: k,
        value: draft.payment[k],
        onMinus: () => { draft.payment[k] = Math.max(0, draft.payment[k] - 1); this.render(); },
        onPlus: () => { draft.payment[k] += 1; this.render(); },
      });
      place(stepper);
    }
    space(PICKER_MARGIN - ROW_GAP);
    // Village the goods come from and the payment goes to.
    plain(t('trade.yourVillage'), 0xcccccc);
    const sim = gameController.getSim();
    const home = sim ? villageList(pickVillage(villageGroups(sim.map, useGameStore.getState().localPlayerIndex), draft.village), (v) => { draft.village = { q: v.q, r: v.r }; this.render(); }) : undefined;
    const goods = goodsValue(order.resource, order.quantity);
    const ok = priceInRange(order.resource, order.quantity, draft.payment);
    // Centred "Value N" and "(allowed a — b)", a gap apart.
    const fill = ok ? 0xcccccc : 0xff8a80;
    const value = makeRichLabel(t('trade.value', { value: tok(ResourceKind.MONEY, paymentValue(draft.payment)) }), { fontSize: FontSize.SMALL, fill, width: popup.contentWidth });
    const range = makeRichLabel(t('trade.allowed', { min: Math.ceil(goods * PRICE_FLOOR), max: Math.floor(goods * PRICE_CEILING) }), { fontSize: FontSize.SMALL, fill, width: popup.contentWidth });
    range.x = value.width + VALUE_GAP;
    const valueLine = new Container();
    valueLine.addChild(value, range);
    place(valueLine);
    const buttons = new Container();
    const send = btn(t('trade.send'), () => { gameController.trade.propose(order.id, draft.payment, home ? { q: home.q, r: home.r } : undefined); this.draft = null; this.render(); }, !ok);
    const cancel = btn(t('common.cancel'), () => { this.draft = null; this.render(); });
    cancel.x = send.width + BTN_GAP;
    buttons.addChild(send, cancel);
    place(buttons);
    void popup;
  }
}
