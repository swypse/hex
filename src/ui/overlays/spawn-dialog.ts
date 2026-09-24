import { t } from '../../i18n';
import { Container, Graphics } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { hasSkill } from '../../game/skills';
import { tileAt } from '../../game/selection';
import { UNIT_TYPES, UNIT_TYPE_NAMES, type UnitType } from '../../game/units';
import { TRIBE_SPECIAL_UNIT, TRIBES } from '../../game/tribes';
import type { Player } from '../../game/players';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { makeActionButtonIcon } from '../kit/action-button-icons';
import { makeIcon } from '../kit/icon';
import { makeLabel } from '../kit/label';
import { Popup } from '../kit/popup';

// Fixed 3-icon grid: 3 columns, 4px margins around each cell.
const COLS = 3;
const CELL_W = 92;
const CELL_H = 112;
const ITEM_PAD = 4;
const RESOURCE_ICON_SIZE = 16;

/** The special unit types (one per tribe). */
const SPECIAL_TYPES = Object.values(TRIBE_SPECIAL_UNIT) as UnitType[];

function isSpecialType(type: UnitType): boolean {
  return SPECIAL_TYPES.includes(type);
}

function tribeCodeFor(type: UnitType): string {
  return TRIBES.find((tr) => TRIBE_SPECIAL_UNIT[tr.id] === type)?.code ?? 'cats';
}

/** The 7 base playable units every tribe can spawn. */
const BASE_PLAYABLE: Exclude<UnitType, 'pirate'>[] = ['warrior', 'rider', 'archer', 'swordsman', 'shield', 'catapult', 'knight'];

/** Types shown in the spawn popup for a player: the 7 base units plus that
 *  player's tribe special unit. */
export function spawnableTypesFor(player: Player): Exclude<UnitType, 'pirate'>[] {
  const special = TRIBE_SPECIAL_UNIT[player.tribe] as Exclude<UnitType, 'pirate'>;
  return [...BASE_PLAYABLE, ...(BASE_PLAYABLE.includes(special) ? [] : [special])];
}

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
      title: t('spawn.title'),
      // Sized so the content area holds exactly 3 columns + the 4px margins.
      width: 2 * 20 + COLS * CELL_W + (COLS - 1) * ITEM_PAD,
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(popup.el);
    this.el = popup.el;
    this.popup = popup;
    this.drawGrid();
    popup.finish();
  }

  private types(): Exclude<UnitType, 'pirate'>[] {
    const s = useGameStore.getState();
    const player = s.players[s.localPlayerIndex];
    if (!player) return BASE_PLAYABLE;
    return spawnableTypesFor(player);
  }

  private reasons(type: UnitType): string[] {
    const s = useGameStore.getState();
    const player = s.players[s.localPlayerIndex];
    const info = UNIT_TYPES[type];
    const out: string[] = [];
    if (!player) return out;
    if (TRIBE_SPECIAL_UNIT[player.tribe] !== type && isSpecialType(type)) {
      out.push(t('spawn.reasonTribe', { tribe: t(`tribe.${tribeCodeFor(type)}`) }));
    }
    if (player.resources.money < info.price) out.push(t('spawn.reasonMoney', {
      need: info.price,
      have: player.resources.money
    }));
    if (info.priceWood > 0 && player.resources.wood < info.priceWood) out.push(t('spawn.reasonWood', {
      need: info.priceWood,
      have: player.resources.wood
    }));
    if (info.priceOre > 0 && player.resources.ore < info.priceOre) out.push(t('spawn.reasonOre', {
      need: info.priceOre,
      have: player.resources.ore
    }));
    if (type === 'rider' && !hasSkill(player, 'riding')) out.push(t('spawn.reasonSkill', { skill: t('skill.riding.name') }));
    if (type === 'knight' && !hasSkill(player, 'knights')) out.push(t('spawn.reasonSkill', { skill: t('skill.knights.name') }));
    if (type === 'swordsman' && !hasSkill(player, 'swordsman')) out.push(t('spawn.reasonSkill', { skill: t('skill.swordsman.name') }));
    if (type === 'shield' && !hasSkill(player, 'shields')) out.push(t('spawn.reasonSkill', { skill: t('skill.shields.name') }));
    if (type === 'catapult' && !hasSkill(player, 'catapult')) out.push(t('spawn.reasonSkill', { skill: t('skill.catapult.name') }));
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
    const cols = COLS;
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

      const icon = makeActionButtonIcon(`action-spawn-${isSpecialType(type) ? 'warrior' : type}`, 56);
      icon.position.set(CELL_W / 2, 30);
      item.addChild(icon);

      const name = makeLabel(UNIT_TYPE_NAMES[type], { fontSize: 14, fill: 0xffffff });
      name.position.set((CELL_W - name.width) / 2, 66);
      item.addChild(name);

      this.addPriceRow(item, type);

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

  /** Money / wood / ore costs as a centred row of 16px resource icons next to
   *  their amounts, e.g. `30 💰 20 🪵 5 ⛏`. Zero-cost resources are omitted. */
  private addPriceRow(item: Container, type: UnitType): void {
    const info = UNIT_TYPES[type];
    const parts: { icon: string; label: string }[] = [{ icon: 'gold-32', label: String(info.price) }];
    if (info.priceWood > 0) parts.push({ icon: 'wood-32', label: String(info.priceWood) });
    if (info.priceOre > 0) parts.push({ icon: 'ore-32', label: String(info.priceOre) });

    const row = new Container();
    let x = 0;
    for (const p of parts) {
      const value = makeLabel(p.label, { fontSize: 14, fill: 0xffffff });
      const icon = makeIcon(p.icon, RESOURCE_ICON_SIZE);
      icon.position.set(x + value.width + RESOURCE_ICON_SIZE / 2 + 2, RESOURCE_ICON_SIZE / 2);
      value.position.set(x, 0);
      row.addChild(value, icon);
      x += value.width + RESOURCE_ICON_SIZE + 2 + 6;
    }
    row.position.set((CELL_W - x) / 2, 84);
    item.addChild(row);
  }

  private drawReasons(type: UnitType): void {
    if (!this.popup) return;
    this.reasonFor = type;
    this.clearContent();
    const content = this.popup.content;
    const lines = this.reasons(type);
    const name = makeLabel(t('spawn.cannot', { unit: UNIT_TYPE_NAMES[type] }), {
      fontSize: 14,
      fill: 0xffffff,
      fontWeight: '700'
    });
    name.position.set(0, 0);
    content.addChild(name);
    let y = name.height + 8;
    for (const line of lines) {
      const t = makeLabel(line, {
        fontSize: 14,
        fill: 0xcccccc,
        wordWrap: true,
        wordWrapWidth: this.popup.contentWidth
      });
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
