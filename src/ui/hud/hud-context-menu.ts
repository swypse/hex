import { Container, Graphics, Rectangle, type Ticker } from 'pixi.js';
import { gameController } from '../../controller/game-controller';
import { canOpenSkill } from '../../game/skills';
import { makeLabel } from '../../gfx/label';
import { THEME } from '../../gfx/theme';
import { ACTION_BUTTON_ICON_FILES, makeActionButtonIcon } from '../../gfx/action-button-icons';
import { makeSkillIcon, SKILL_ICON_FILES } from '../../gfx/skill-icons';
import { t } from '../../i18n';
import { useGameStore } from '../../store/game-store';
import { tileAt } from '../../game/map/tile-index';
import type { GameMap, MapTile } from '../../game/map/map-gen';
import type { Player } from '../../game/players';
import { villageIncomeBreakdown } from '../../game/economy/capture';
import { villageFood, farmYield } from '../../game/economy/food';
import { buildingYield } from '../../game/economy/buildings';
import { buildingCapacity, heldInBuilding } from '../../game/economy/building-stock';
import { makeIcon } from '../kit/icon';
import { type UIHost, type Widget } from '../host';
import { toolbarSpecs } from './toolbar-specs';
import { suggestedSkillActions } from './suggested-skills';
import { BuildingKind, FontSize } from '@enums';

const BUILD_KEYS = new Set<string>([...Object.values(BuildingKind), 'road', 'bridge', 'build']);
const ICON_SIZE = 34;
const ICON_GAP = 8;
const ROW_GAP = 8;
const PAD_X = 10;
const PAD_Y = 8;
const LABEL_GAP = 10;
const TRI_H = 6;
const TRI_W = 12;
/** Gap between the arrow tip and the hex's top corner. */
const TIP_GAP = 4;
const INFO_ICON = 16;
const INFO_GAP = 14;
const INFO_HEIGHT = 20;
/** Fade duration; same as the expected-damage badge. */
const ANIM_MS = 80;

interface MenuItem {
  icon: Container;
  disabled: boolean;
  onClick: () => void;
}
/** One `<icon> text` segment of the income line. */
interface InfoSegment {
  icon: string;
  text: string;
}
interface MenuContent {
  info: InfoSegment[];
  rows: MenuRow[];
}
interface MenuRow {
  label: string;
  items: MenuItem[];
}

/** Long-press / right-click menu over the selected hex: build actions and
 *  suggested skills as icon rows in an arrow tooltip above the hex's top corner. */
export class HudContextMenu implements Widget {
  private host: UIHost | null = null;
  private root: Container | null = null;
  private unsub: (() => void) | null = null;
  private current: { el: Container; key: string; q: number; r: number } | null = null;
  private fading = new Map<Container, { from: number; to: number; start: number }>();
  private tick: ((ticker: Ticker) => void) | null = null;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    this.root = root;
    this.tick = () => this.frame();
    host.app.ticker.add(this.tick);
    this.unsub = useGameStore.subscribe(() => this.sync());
  }

  /** Income line for own villages, sawmills, mines and farms (same numbers as the info panel). */
  private info(map: GameMap, tile: MapTile, human: Player): InfoSegment[] {
    if (tile.settlement?.owner === human.index) {
      const income = villageIncomeBreakdown(map, tile);
      const food = villageFood(map, tile, human);
      return [
        { icon: 'gold-32', text: `${income.total} (${income.gross} - ${income.deducted})` },
        { icon: 'food-32', text: `${food.balance} (${food.production} - ${food.upkeep})` },
      ];
    }
    const b = tile.building;
    if (!b || tile.ownedBy !== human.index) return [];
    if (b.kind === BuildingKind.FARM) return [{ icon: 'food-32', text: String(farmYield(human, map, tile)) }];
    if (b.kind !== BuildingKind.SAWMILL && b.kind !== BuildingKind.MINE) return [];
    const y = buildingYield(map, tile, human);
    const stock = (res: 'wood' | 'stone' | 'ore'): InfoSegment => ({
      icon: `${res}-32`,
      text: `${y[res]} [${heldInBuilding(b, res)}/${buildingCapacity(b, res)}]`,
    });
    return (['wood', 'stone', 'ore'] as const).filter((res) => y[res] > 0).map(stock);
  }

  private rows(q: number, r: number): MenuContent {
    const store = useGameStore.getState();
    const map = gameController.getMap();
    const tile = map ? tileAt(map, q, r) : undefined;
    const human = store.players[store.localPlayerIndex];
    if (!map || !tile || !human) return { info: [], rows: [] };
    const close = (): void => useGameStore.getState().setContextMenu(null);
    const build: MenuItem[] = toolbarSpecs()
      .filter((s) => BUILD_KEYS.has(s.key))
      .map((s) => ({
        icon: makeActionButtonIcon(ACTION_BUTTON_ICON_FILES[s.key] ? s.key : 'build', ICON_SIZE),
        disabled: s.disabled,
        onClick: () => {
          close();
          s.onClick();
        },
      }));
    const skills: MenuItem[] = suggestedSkillActions(tile, human).flatMap((a) => {
      const file = SKILL_ICON_FILES[a.id];
      if (!file) return [];
      return [{
        icon: makeSkillIcon(file, ICON_SIZE),
        disabled: !canOpenSkill(human, a.id, map),
        onClick: () => {
          close();
          gameController.actions.openSkill(a.id);
        },
      }];
    });
    const rows: MenuRow[] = [];
    if (build.length > 0) rows.push({ label: t('menu.build'), items: build });
    if (skills.length > 0) rows.push({ label: t('menu.openSkill'), items: skills });
    return { info: this.info(map, tile, human), rows };
  }

  private sync(): void {
    const s = useGameStore.getState();
    const open = s.contextMenu;
    const valid =
      open && !s.aiActive && !s.gameOver && !s.paused && s.overlay === null
      && s.selection?.q === open.q && s.selection?.r === open.r;
    if (!valid) {
      if (open && (s.selection?.q !== open.q || s.selection?.r !== open.r)) s.setContextMenu(null);
      this.dismiss();
      return;
    }
    const { info, rows } = this.rows(open.q, open.r);
    if (rows.length === 0 && info.length === 0) {
      s.setContextMenu(null);
      this.dismiss();
      return;
    }
    const key = `${open.q},${open.r}|${info.map((i) => i.icon + i.text).join(',')}|${rows.map((r) => r.items.map((i) => (i.disabled ? 'x' : 'o')).join('') + r.items.length).join('/')}`;
    if (this.current?.key === key) {
      rows.forEach((r) => r.items.forEach((i) => i.icon.destroy()));
      return;
    }
    this.dismiss();
    this.show(open.q, open.r, key, info, rows);
  }

  private show(q: number, r: number, key: string, info: InfoSegment[], rows: MenuRow[]): void {
    if (!this.root) return;
    const labels = rows.map((row) => makeLabel(row.label, { fontSize: FontSize.VERY_SMALL, fill: THEME.white }));
    const labelW = Math.max(0, ...labels.map((l) => l.width));
    const rowW = Math.max(0, ...rows.map((row) => row.items.length * ICON_SIZE + (row.items.length - 1) * ICON_GAP));
    // Income line: icon + value pairs, left to right.
    const infoEl = new Container();
    let ix = 0;
    for (const seg of info) {
      const icon = makeIcon(seg.icon, INFO_ICON);
      icon.anchor.set(0, 0.5);
      icon.position.set(ix, INFO_HEIGHT / 2);
      const text = makeLabel(seg.text, { fontSize: FontSize.VERY_SMALL, fill: THEME.white });
      text.position.set(ix + INFO_ICON + 4, (INFO_HEIGHT - text.height) / 2);
      infoEl.addChild(icon, text);
      ix += INFO_ICON + 4 + text.width + INFO_GAP;
    }
    const infoW = info.length > 0 ? ix - INFO_GAP : 0;
    const rowsW = rows.length > 0 ? labelW + LABEL_GAP + rowW : 0;
    const w = PAD_X * 2 + Math.max(infoW, rowsW);
    const infoH = info.length > 0 ? INFO_HEIGHT + (rows.length > 0 ? ROW_GAP : 0) : 0;
    const rowsH = rows.length > 0 ? rows.length * ICON_SIZE + (rows.length - 1) * ROW_GAP : 0;
    const h = PAD_Y * 2 + infoH + rowsH;

    const el = new Container();
    el.zIndex = 100;
    const body = new Graphics();
    body.roundRect(0, 0, w, h, 6).fill({ color: 0x000000, alpha: 0.92 });
    const tri = new Graphics();
    tri.poly([w / 2 - TRI_W / 2, h, w / 2 + TRI_W / 2, h, w / 2, h + TRI_H]).fill(0x000000);
    el.addChild(body, tri);
    infoEl.position.set(PAD_X, PAD_Y);
    el.addChild(infoEl);
    rows.forEach((row, i) => {
      const y = PAD_Y + infoH + i * (ICON_SIZE + ROW_GAP);
      const label = labels[i]!;
      label.position.set(PAD_X, y + (ICON_SIZE - label.height) / 2);
      el.addChild(label);
      row.items.forEach((item, j) => {
        const btn = new Container();
        btn.position.set(PAD_X + labelW + LABEL_GAP + j * (ICON_SIZE + ICON_GAP), y);
        item.icon.position.set(ICON_SIZE / 2, ICON_SIZE / 2);
        btn.addChild(item.icon);
        btn.hitArea = new Rectangle(0, 0, ICON_SIZE, ICON_SIZE);
        btn.alpha = item.disabled ? 0.5 : 1;
        if (!item.disabled) {
          btn.eventMode = 'static';
          btn.cursor = 'pointer';
          btn.on('pointertap', item.onClick);
        }
        el.addChild(btn);
      });
    });
    // Anchor at the arrow tip.
    el.pivot.set(w / 2, h + TRI_H);
    el.eventMode = 'static';
    el.alpha = 0;
    this.root.addChild(el);
    this.current = { el, key, q, r };
    this.place();
    this.fading.set(el, { from: 0, to: 1, start: performance.now() });
  }

  private dismiss(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.el.eventMode = 'none';
    cur.el.interactiveChildren = false;
    this.fading.set(cur.el, { from: cur.el.alpha, to: 0, start: performance.now() });
  }

  /** Follows the hex's top corner as the camera moves. */
  private place(): void {
    const cur = this.current;
    if (!cur || !this.host) return;
    const p = gameController.tileTopScreen(cur.q, cur.r);
    if (p) cur.el.position.set(p.x, p.y - TIP_GAP);
  }

  private frame(): void {
    this.place();
    if (this.fading.size === 0) return;
    const now = performance.now();
    for (const [el, a] of this.fading) {
      const k = Math.min(1, (now - a.start) / ANIM_MS);
      el.alpha = a.from + (a.to - a.from) * k;
      if (k < 1) continue;
      this.fading.delete(el);
      if (a.to === 0) el.destroy({ children: true });
    }
  }

  destroy(): void {
    this.unsub?.();
    this.unsub = null;
    if (this.tick) this.host?.app.ticker.remove(this.tick);
    this.tick = null;
    for (const el of this.fading.keys()) if (!el.destroyed) el.destroy({ children: true });
    this.fading.clear();
    if (this.current && !this.current.el.destroyed) this.current.el.destroy({ children: true });
    this.current = null;
  }
}
