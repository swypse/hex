import { Container } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { villageIncomeTotal } from '../../game/capture';
import { buildingIncome } from '../../game/buildings';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { makePanel } from '../kit/panel';
import { Tooltip } from '../kit/tooltip';
import { RESOURCE_TOOLTIPS } from './resourceTooltips';

export class HudMoney implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private lastKey = '';
  private measured = 0;
  private tooltip: Tooltip | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.tooltip = new Tooltip(host.app);
    host.app.stage.addChild(this.tooltip.el);
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const cx = this.host.app.screen.width / 2;
    this.el.position.set(cx - this.measured / 2, 0);
  };

  private resources(): { money: number; wood: number; stone: number; ore: number; moneyIncome: number; building: { wood: number; stone: number; ore: number } } {
    const s = useGameStore.getState();
    const human = s.players[s.localPlayerIndex];
    const map = gameController.getMap();
    const zero = { wood: 0, stone: 0, ore: 0 };
    if (!human) return { money: 0, wood: 0, stone: 0, ore: 0, moneyIncome: 0, building: zero };
    const moneyIncome = map ? villageIncomeTotal(map, human.index) : 0;
    const building = map ? buildingIncome(map, human) : zero;
    return { money: human.resources.money, wood: human.resources.wood, stone: human.resources.stone, ore: human.resources.ore, moneyIncome, building };
  }

  private update(): void {
    if (!this.el || !this.host) return;
    const r = this.resources();
    const key = [r.money, r.wood, r.stone, r.ore].join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.el.removeChildren();
    this.tooltip?.hide();

    const compact = this.host.app.screen.width <= 600;
    const iconSize = compact ? 17 : 21;
    const fontSize = compact ? 11 : 13;
    const cy = compact ? 13 : 15;
    const rows = [
      { key: 'money', icon: 'coin.png', value: `${r.money}`, income: r.moneyIncome > 0 ? ` (+${r.moneyIncome})` : '' },
      { key: 'wood', icon: 'wood.png', value: `${r.wood}`, income: r.building.wood > 0 ? ` (+${r.building.wood})` : '' },
      { key: 'stone', icon: 'stone.png', value: `${r.stone}`, income: r.building.stone > 0 ? ` (+${r.building.stone})` : '' },
      { key: 'ore', icon: 'ore.png', value: `${r.ore}`, income: r.building.ore > 0 ? ` (+${r.building.ore})` : '' },
    ];

    let x = 0;
    let maxH = compact ? 26 : 30;
    for (const row of rows) {
      const icon = makeIcon(row.icon, iconSize);
      icon.eventMode = 'static';
      icon.position.set(x + iconSize / 2 + 6, cy);
      const info = RESOURCE_TOOLTIPS[row.key as keyof typeof RESOURCE_TOOLTIPS];
      if (info && this.tooltip) {
        icon.on('pointerover', () => this.tooltip!.showForAfter(icon, info.name, `Required for ${info.requiredFor}`, 500));
        icon.on('pointerout', () => this.tooltip!.hideAfter(500));
        icon.on('pointerdown', () => this.tooltip!.showFor(icon, info.name, `Required for ${info.requiredFor}`));
      }
      const value = makeLabel(row.value, { fontSize });
      value.position.set(x + iconSize + 11, cy - value.height / 2);
      this.el.addChild(icon, value);
      let rowW = value.width;
      if (row.income !== '') {
        const income = makeLabel(row.income, { fontSize, fill: 0xaaaaaa });
        income.position.set(x + iconSize + 11 + value.width, cy - income.height / 2);
        this.el.addChild(income);
        rowW += income.width;
      }
      x += iconSize + 11 + rowW + 6;
      maxH = Math.max(maxH, value.height + 10);
    }
    this.measured = x;

    const bg = makePanel(x, maxH, { fill: 0x333344, alpha: 1, bottomRadiusOnly: true });
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);
    this.layout();
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.tooltip?.destroy();
    this.tooltip = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
