import { t } from '../../i18n';
import type { Container } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { hasSkill } from '../../game/skills';
import { networkStock } from '../../game/economy/stock';
import { UNIT_TYPES, UNIT_TYPE_NAMES } from '../../game/units/units';
import { BASE_UNIT_TYPES, TRIBE_SPECIAL_UNIT, TRIBES } from '../../game/tribes';
import type { Player } from '../../game/players';
import { useGameStore } from '../../store/game-store';
import { type UIHost } from '../host';
import { Button } from '../kit/button';
import { ACTION_CELL_H, ACTION_CELL_W, makeActionCircleButton, resourceCostParts } from '../kit/action-circle-button';
import { makeLabel } from '../../gfx/label';
import { Popup } from '../kit/popup';
import { PopupDialog } from './popup-dialog';
import { FontSize, SkillId, UnitType } from '@enums';
import { tileAt } from '../../game/map/tile-index';

// Fixed 3-icon grid: 3 columns, 4px margins around each cell.
const COLS = 3;
const ITEM_PAD = 4;
const EMPTY_COST = { wood: 0, stone: 0, money: 0, ore: 0, food: 0 };
// The circle buttons are drawn flush with (0, 0) inside their cell, and their
// stroke is centered on the circle path, so it overhangs the fill by half its
// width. Without this margin the popup's content mask (which starts exactly
// at the grid's own top-left corner) clips that overhang off the top row.
const GRID_MARGIN = 4;

/** The special unit types (one per tribe). */
const SPECIAL_TYPES = Object.values(TRIBE_SPECIAL_UNIT) as UnitType[];

function isSpecialType(type: UnitType): boolean {
  return SPECIAL_TYPES.includes(type);
}

function tribeCodeFor(type: UnitType): string {
  return TRIBES.find((tr) => TRIBE_SPECIAL_UNIT[tr.id] === type)?.code ?? 'cats';
}

/** The 7 base playable units every tribe can spawn. */
const BASE_PLAYABLE = BASE_UNIT_TYPES;

/** Types shown in the spawn popup for a player: the 7 base units plus that
 *  player's tribe special unit. */
export function spawnableTypesFor(player: Player): Exclude<UnitType, 'pirate'>[] {
  const special = TRIBE_SPECIAL_UNIT[player.tribe] as Exclude<UnitType, 'pirate'>;
  return [...BASE_PLAYABLE, ...(BASE_PLAYABLE.includes(special) ? [] : [special])];
}

const ARROW_STEPS: Record<string, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

export class SpawnDialog extends PopupDialog {
  /** Grid index chosen with the keyboard. */
  private selected = 0;
  private showingReasons = false;
  mount(host: UIHost, root: Container): void {
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
      // Sized so the content area holds exactly 3 columns + the inter-cell
      // margins, plus a 4px margin on each side of the grid itself.
      width: 2 * 20 + 2 * GRID_MARGIN + COLS * ACTION_CELL_W + (COLS - 1) * ITEM_PAD,
      onClose: () => useGameStore.getState().setOverlay(null),
    });
    root.addChild(popup.el);
    this.popup = popup;
    this.selected = Math.max(0, this.types().findIndex((type) => this.reasons(type).length === 0));
    this.drawGrid();
    popup.finish();
    window.addEventListener('keydown', this.onKeyDown);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    super.destroy();
  }

  /** Arrows move the selection over the grid, Enter spawns the selected unit (or explains why it can't). */
  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.showingReasons) {
        this.drawGrid();
        return;
      }
      const type = this.types()[this.selected];
      if (!type) return;
      if (this.reasons(type).length > 0) this.drawReasons(type);
      else gameController.actions.spawnSelectedVillage(type);
      return;
    }
    const step = ARROW_STEPS[e.key];
    if (!step || this.showingReasons) return;
    e.preventDefault();
    const col = this.selected % COLS + step.dx;
    const next = this.selected + step.dx + step.dy * COLS;
    if (col < 0 || col >= COLS || next < 0 || next >= this.types().length) return;
    this.selected = next;
    this.drawGrid();
  };

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
    // Wood and ore come from the spawning village's network.
    const map = gameController.getMap();
    const sel = s.selection;
    const village = map && sel ? tileAt(map, sel.q, sel.r) : undefined;
    const stock = map && village?.settlement ? networkStock(map, village) : { wood: 0, stone: 0, ore: 0, food: 0 };
    if (info.priceWood > 0 && stock.wood < info.priceWood) out.push(t('spawn.reasonWood', {
      need: info.priceWood,
      have: stock.wood
    }));
    if (info.priceOre > 0 && stock.ore < info.priceOre) out.push(t('spawn.reasonOre', {
      need: info.priceOre,
      have: stock.ore
    }));
    if (type === UnitType.RIDER && !hasSkill(player, SkillId.RIDING)) out.push(t('spawn.reasonSkill', { skill: t('skill.riding.name') }));
    if (type === UnitType.KNIGHT && !hasSkill(player, SkillId.KNIGHTS)) out.push(t('spawn.reasonSkill', { skill: t('skill.knights.name') }));
    if (type === UnitType.SWORDSMAN && !hasSkill(player, SkillId.SWORDSMAN)) out.push(t('spawn.reasonSkill', { skill: t('skill.swordsman.name') }));
    if (type === UnitType.SHIELD && !hasSkill(player, SkillId.SHIELDS)) out.push(t('spawn.reasonSkill', { skill: t('skill.shields.name') }));
    if (type === UnitType.ARCHER && !hasSkill(player, SkillId.ARCHER)) out.push(t('spawn.reasonSkill', { skill: t('skill.archer.name') }));
    if (type === UnitType.CATAPULT && !hasSkill(player, SkillId.CATAPULT)) out.push(t('spawn.reasonSkill', { skill: t('skill.catapult.name') }));
    return out;
  }

  private clearContent(): void {
    if (!this.popup) return;
    this.popup.content.removeChildren();
    this.popup.setButtons([]);
  }

  private drawGrid(): void {
    if (!this.popup) return;
    this.clearContent();
    this.showingReasons = false;
    const types = this.types();
    const cols = COLS;
    const content = this.popup.content;
    types.forEach((type, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const reasons = this.reasons(type);
      const disabled = reasons.length > 0;
      const info = UNIT_TYPES[type];
      const item = makeActionCircleButton({
        icon: `action-spawn-${type}`,
        name: UNIT_TYPE_NAMES[type],
        cost: resourceCostParts({ ...EMPTY_COST, money: info.price, wood: info.priceWood, ore: info.priceOre }),
        dimmed: disabled,
        highlighted: i === this.selected,
        onClick: () => {
          if (disabled) this.drawReasons(type);
          else gameController.actions.spawnSelectedVillage(type);
        },
      });
      item.position.set(GRID_MARGIN + col * (ACTION_CELL_W + ITEM_PAD), GRID_MARGIN + row * (ACTION_CELL_H + ITEM_PAD));
      content.addChild(item);
    });
    this.popup.reflow();
  }

  private drawReasons(type: UnitType): void {
    if (!this.popup) return;
    this.clearContent();
    this.showingReasons = true;
    const content = this.popup.content;
    const lines = this.reasons(type);
    const name = makeLabel(t('spawn.cannot', { unit: UNIT_TYPE_NAMES[type] }), {
      fontSize: FontSize.SMALL,
      fill: 0xffffff,
      fontWeight: '700'
    });
    name.position.set(0, 0);
    content.addChild(name);
    let y = name.height + 8;
    for (const line of lines) {
      const t = makeLabel(line, {
        fontSize: FontSize.SMALL,
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
}
