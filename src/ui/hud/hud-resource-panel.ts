import { t } from '../../i18n';
import { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { villageIncomeTotal } from '../../game/capture';
import { networkBuildingIncome } from '../../game/buildings';
import { tileAt } from '../../game/selection';
import { networkStock, villageNetwork, villageOfTile } from '../../game/stock';
import type { MapTile } from '../../game/map-gen';
import { useGameStore } from '../../store/game-store';
import { markDirty } from '../../render/render-gate';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';
import { Button } from '../kit/button';
import { RESOURCE_TOOLTIPS } from './resource-tooltips';

/** How often the panel re-checks the map-derived income. Game events that alter
 *  income (unit spawn, capture, death, skill, building) may not touch the store,
 *  so a cheap poll keeps the values correct without a per-event hook. */
const REFRESH_MS = 500;

export class HudResourcePanel implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onResize: (() => void) | null = null;
  private lastKey = '';
  private measured = 0;
  private popup: Popup | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.timer = setInterval(() => this.update(), REFRESH_MS);
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const cx = this.host.app.screen.width / 2;
    this.el.position.set(cx - this.measured / 2, 0);
  };

  /** Money is the player's own; wood, stone, ore and food are those of the
   *  selected village's network. `village` is null (and the materials hidden)
   *  while no tile of one of the player's villages is selected. */
  private resources(): {
    money: number;
    wood: number;
    stone: number;
    ore: number;
    food: number;
    moneyIncome: number;
    building: { wood: number; stone: number; ore: number };
    village: MapTile | null;
    networkSize: number;
  } {
    const s = useGameStore.getState();
    const human = s.players[s.localPlayerIndex];
    const map = gameController.getMap();
    const zero = { wood: 0, stone: 0, ore: 0 };
    const none = { money: 0, wood: 0, stone: 0, ore: 0, food: 0, moneyIncome: 0, building: zero, village: null, networkSize: 0 };
    if (!human) return none;
    const moneyIncome = map ? villageIncomeTotal(map, human.index) : 0;
    const base = { ...none, money: human.resources.money, moneyIncome };
    if (!map || !s.selection) return base;
    const selected = tileAt(map, s.selection.q, s.selection.r);
    if (!selected) return base;
    const village = villageOfTile(map, human.index, selected);
    if (!village) return base;
    const stock = networkStock(map, village);
    return {
      ...base,
      wood: stock.wood,
      stone: stock.stone,
      ore: stock.ore,
      food: stock.food,
      building: networkBuildingIncome(map, human, village),
      village,
      networkSize: villageNetwork(map, village).length,
    };
  }

  private update(): void {
    if (!this.el || !this.host) return;
    const r = this.resources();
    // The change key includes the incomes too, so income-only changes (spawn,
    // capture, death, skill, building) redraw even when the amounts don't move.
    const key = [r.money, r.village ? `${r.village.q}:${r.village.r}` : '-', r.networkSize, r.wood, r.stone, r.ore, r.food, r.moneyIncome, r.building.wood, r.building.stone, r.building.ore].join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;
    markDirty();

    this.el.removeChildren();

    const compact = this.host.app.screen.width <= 600;
    const iconSize = compact ? 12 : 16;
    const fontSize = compact ? 14 : 16;
    const padSide = 6;
    const padTop = 10;
    const cy = padTop + iconSize / 2;
    // Money always shows. The materials are the selected village network's, so
    // they only show while a tile of one of your villages is selected. Food is
    // the villages' reserve; once it is spent the row disappears (farm and
    // granary food is shown per village in the selected-cell panel).
    const rows = [
      { key: 'money', icon: 'gold-32', value: `${r.money}`, income: r.moneyIncome > 0 ? ` (+${r.moneyIncome})` : '' },
      { key: 'wood', icon: 'wood-32', value: `${r.wood}`, income: r.building.wood > 0 ? ` (+${r.building.wood})` : '' },
      { key: 'stone', icon: 'stone-32', value: `${r.stone}`, income: r.building.stone > 0 ? ` (+${r.building.stone})` : '' },
      { key: 'ore', icon: 'ore-32', value: `${r.ore}`, income: r.building.ore > 0 ? ` (+${r.building.ore})` : '' },
      { key: 'food', icon: 'food-32', value: `${r.food}`, income: '' },
    ].filter((row) => row.key === 'money' || (r.village !== null && (row.key !== 'food' || r.food > 0)));

    let x = padSide;
    for (const row of rows) {
      const icon = makeIcon(row.icon, iconSize);
      icon.eventMode = 'static';
      icon.cursor = 'pointer';
      icon.position.set(x + iconSize / 2 + 6, cy);
      const open = (): void => this.openResourcePopup(row.key as 'money' | 'wood' | 'stone' | 'ore' | 'food');
      icon.on('pointertap', open);
      const value = makeLabel(row.value, { fontSize });
      value.eventMode = 'static';
      value.cursor = 'pointer';
      value.position.set(x + iconSize + 11, cy - value.height / 2);
      value.on('pointertap', open);
      this.el.addChild(icon, value);
      let rowW = value.width;
      if (row.income !== '') {
        const income = makeLabel(row.income, { fontSize: 13, fill: 0xffffff });
        income.alpha = 0.8;
        income.eventMode = 'static';
        income.cursor = 'pointer';
        income.position.set(x + iconSize + 11 + value.width, cy - income.height / 2);
        income.on('pointertap', open);
        this.el.addChild(income);
        rowW += income.width;
      }
      x += iconSize + 11 + rowW + 6;
    }
    this.measured = x + padSide;
    this.layout();
  }

  private openResourcePopup(resource: 'money' | 'wood' | 'stone' | 'ore' | 'food'): void {
    if (!this.host) return;
    const r = this.resources();
    const info = RESOURCE_TOOLTIPS[resource];
    const income = resource === 'money' ? r.moneyIncome : resource === 'food' ? 0 : r.building[resource];
    const amount = r[resource];
    if (this.popup) {
      this.popup.destroy();
      this.popup = null;
    }
    const close = new Button({ label: t('common.close'), onClick: () => this.closePopup() });
    const popup = new Popup({
      app: this.host.app,
      title: income > 0 ? `${info.name}: ${amount} (+${income})` : income < 0 ? `${info.name}: ${amount} (${income})` : `${info.name}: ${amount}`,
      buttons: [close],
      onClose: () => this.closePopup(),
    });
    const lines = [t('res.collect.' + resource)];
    if (resource !== 'money' && r.networkSize > 1) lines.push(t('res.shared', { n: r.networkSize }));
    else if (resource !== 'money') lines.push(t('res.sharedOne'));
    if (info.requiredFor.length > 0) lines.push(t('res.required', { text: info.requiredFor }));
    let y = 0;
    for (const line of lines) {
      const label = makeLabel(line, {
        fontSize: 14,
        fill: 0xeeeeee,
        wordWrap: true,
        wordWrapWidth: popup.contentWidth,
      });
      label.position.set(0, y);
      y += label.height + 6;
      popup.content.addChild(label);
    }
    this.host.overlayLayer.addChild(popup.el);
    this.popup = popup;
    popup.finish();
  }

  private closePopup(): void {
    if (this.popup) {
      this.popup.destroy();
      this.popup = null;
    }
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.closePopup();
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
