import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { hasSkill } from '../../game/skills';
import { tileAt } from '../../game/selection';
import { UNIT_TYPES, UNIT_TYPE_NAMES, type UnitType } from '../../game/units';
import { useGameStore } from '../../store/gameStore';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

const SPAWN_ICONS: Record<Exclude<UnitType, 'pirate'>, string> = {
  warrior: 'fist.png',
  archer: 'arch.png',
  rider: 'horse.png',
  swordsman: 'sword.png',
  shield: 'shield.png',
  catapult: 'catapult.png',
  knight: 'knight.png',
};

const CELL_W = 92;
const CELL_H = 112;
const ITEM_PAD = 6;

export class SpawnDialog {
  private el: Container | null = null;
  private popup: Popup | null = null;
  private host: UIHost | null = null;
  private reasonFor: UnitType | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.reasonFor = null;
    const s = useGameStore.getState();
    const map = gameController.getMap();
    const selection = s.selection;
    if (!map || !selection) return;
    const village = tileAt(map, selection.q, selection.r);
    const player = s.players[s.localPlayerIndex];
    if (!village || !village.settlement || !player) return;

    const popup = new Popup({
      app: host.app,
      title: 'Spawn a unit',
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    this.drawGrid();
    popup.finish();
  }

  private types(): Exclude<UnitType, 'pirate'>[] {
    return (Object.keys(UNIT_TYPES) as UnitType[]).filter((t) => t !== 'pirate') as Exclude<UnitType, 'pirate'>[];
  }

  private reasons(type: UnitType): string[] {
    const s = useGameStore.getState();
    const player = s.players[s.localPlayerIndex];
    const info = UNIT_TYPES[type];
    const out: string[] = [];
    if (!player) return out;
    if (player.resources.money < info.price) out.push(`Not enough money — need ${info.price}, have ${player.resources.money}`);
    if (info.priceWood > 0 && player.resources.wood < info.priceWood) out.push(`Not enough wood — need ${info.priceWood}, have ${player.resources.wood}`);
    if (info.priceOre > 0 && player.resources.ore < info.priceOre) out.push(`Not enough ore — need ${info.priceOre}, have ${player.resources.ore}`);
    if (type === 'rider' && !hasSkill(player, 'riding')) out.push('Requires the Riding skill');
    if (type === 'knight' && !hasSkill(player, 'knights')) out.push('Requires the Knights skill');
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) out.push('Requires the Swordsman skill');
    if (type === 'shield' && !hasSkill(player, 'shields')) out.push('Requires the Shields skill');
    if (type === 'catapult' && !hasSkill(player, 'catapult')) out.push('Requires the Catapult skill');
    return out;
  }

  private clearContent(): void {
    if (!this.popup) return;
    this.popup.content.removeChildren();
    this.popup.setButtons([]);
  }

  private drawGrid(): void {
    if (!this.popup) return;
    this.reasonFor = null;
    this.clearContent();
    const types = this.types();
    const cols = Math.min(4, Math.max(1, Math.floor((this.popup.contentWidth + ITEM_PAD) / (CELL_W + ITEM_PAD))));
    const content = this.popup.content;
    types.forEach((type, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const item = new Container();
      item.position.set(col * (CELL_W + ITEM_PAD), row * (CELL_H + ITEM_PAD));
      item.eventMode = 'static';
      item.cursor = 'pointer';

      const circle = new Graphics();
      circle.circle(CELL_W / 2, 30, 30).fill(0x333333).stroke({ width: 2, color: 0x888888 });
      item.addChild(circle);

      const icon = makeIcon(SPAWN_ICONS[type], 56);
      icon.position.set(CELL_W / 2, 30);
      item.addChild(icon);

      const name = makeLabel(UNIT_TYPE_NAMES[type], { fontSize: 12, fill: 0xeeeeee });
      name.position.set((CELL_W - name.width) / 2, 66);
      item.addChild(name);

      const info = UNIT_TYPES[type];
      const woodText = info.priceWood > 0 ? ` + ${info.priceWood} wood` : '';
      const oreText = info.priceOre > 0 ? ` + ${info.priceOre} ore` : '';
      const price = makeLabel(`${info.price}${woodText}${oreText}`, { fontSize: 12, fill: 0xeeeeee });
      price.position.set((CELL_W - price.width) / 2, 84);
      item.addChild(price);

      const reasons = this.reasons(type);
      const disabled = reasons.length > 0;
      item.alpha = disabled ? 0.4 : 1;
      item.on('pointertap', () => {
        if (disabled) {
          this.drawReasons(type);
        } else {
          gameController.spawnSelectedVillage(type);
        }
      });
      content.addChild(item);
    });
    this.popup.reflow();
  }

  private drawReasons(type: UnitType): void {
    if (!this.popup) return;
    this.reasonFor = type;
    this.clearContent();
    const content = this.popup.content;
    const lines = this.reasons(type);
    const name = makeLabel(`${UNIT_TYPE_NAMES[type]} — cannot spawn`, { fontSize: 14, fill: 0xffffff, fontWeight: '700' });
    name.position.set(0, 0);
    content.addChild(name);
    let y = name.height + 8;
    for (const line of lines) {
      const t = makeLabel(line, { fontSize: 14, fill: 0xcccccc, wordWrap: true, wordWrapWidth: this.popup.contentWidth });
      t.position.set(0, y);
      y += t.height + 6;
      content.addChild(t);
    }
    const back = new Button({ label: t('common.back'), width: 120, onClick: () => this.drawGrid() });
    this.popup.setButtons([back]);
    this.popup.reflow();
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
    this.reasonFor = null;
  }
}
