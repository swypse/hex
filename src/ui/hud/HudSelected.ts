import { Circle, Container, Graphics, Text } from 'pixi.js';
import { gameController } from '../../controller/gameController';
import { TRIBES } from '../../game/tribes';
import { isForestType, isMountainType, isWaterType, TILE_TYPE_COLORS, TILE_TYPE_NAMES } from '../../game/tileTypes';
import { UNIT_TYPE_NAMES, UNIT_TYPES } from '../../game/units';
import { unitCanAct } from '../../game/unitActions';
import { tileAt } from '../../game/selection';
import { attackDamage } from '../../game/combat';
import { villageCapacity, villageBuildingLimit, buildingsInVillage, unitsInVillage } from '../../game/village';
import { villageIncome } from '../../game/capture';
import { villageUpgradeCost } from '../../game/resources';
import { buildingYield, BUILDING_NAMES } from '../../game/buildings';
import { isExploredFor } from '../../game/explore';
import { hexNeighbors } from '../../game/hex';
import { canOpenSkill, hasSkill, type SkillId } from '../../game/skills';
import type { Player } from '../../game/players';
import type { MapTile } from '../../game/mapGen';
import { useGameStore } from '../../store/gameStore';
import { type UIHost, type Widget } from '../host';
import { makeLabel } from '../kit/label';
import { Button } from '../kit/button';
import { makePanel } from '../kit/panel';
import { isLightColor } from '../kit/theme';
import { TOOLBAR_HEIGHT, TURN_BAR_HEIGHT } from '../layout';

export class HudSelected implements Widget {
  private el: Container | null = null;
  private host: UIHost | null = null;
  private unsub: (() => void) | null = null;
  private onResize: (() => void) | null = null;
  private measured = 0;

  mount(host: UIHost, root: Container): void {
    this.host = host;
    const el = new Container();
    root.addChild(el);
    this.el = el;
    this.layout();
    this.update();
    this.unsub = useGameStore.subscribe(() => this.update());
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
  }

  private layout = (): void => {
    if (!this.el || !this.host) return;
    const bottom = TOOLBAR_HEIGHT + TURN_BAR_HEIGHT + 8;
    this.el.position.set(0, this.host.app.screen.height - bottom - this.measured);
  };

  private update(): void {
    if (!this.el || !this.host) return;
    const s = useGameStore.getState();
    const selection = s.selection;
    const map = gameController.getMap();
    if (!selection || !map) {
      this.el.visible = false;
      return;
    }
    const tile = tileAt(map, selection.q, selection.r);
    const human = s.players[s.localPlayerIndex];
    if (!tile || !human || !isExploredFor(tile, human.index)) {
      this.el.visible = false;
      return;
    }
    this.el.visible = true;

    this.el.removeChildren().forEach((c) => c.destroy({ children: true }));

    const terrainColor = TILE_TYPE_COLORS[tile.terrain];
    const darkText = isLightColor(terrainColor);
    const lines: string[] = [TILE_TYPE_NAMES[tile.terrain]];
    const bolds: boolean[] = [false];
    let unitLineIndex = -1;
    let settlementLineIndex = -1;
    let buildingLineIndex = -1;
    let buildingLimitLineIndex = -1;

    if (tile.unit) {
      const unit = tile.unit;
      const player = unit.owner >= 0 ? s.players[unit.owner] : null;
      const maxHp = UNIT_TYPES[unit.type].maxHp;
      const canAct = unit.type === 'pirate' ? false : unitCanAct(map, tile, unit, player!);
      unitLineIndex = lines.length;
      lines.push(`${UNIT_TYPE_NAMES[unit.type]} HP ${unit.hp}/${maxHp}${canAct ? ' •' : ''} ATK ${attackDamage(unit)}`);
      bolds.push(true);
    }

    if (tile.settlement) {
      const settlement = tile.settlement;
      settlementLineIndex = lines.length;
      lines.push(`${settlement.name ?? 'Settlement'} (lvl ${settlement.level}): ${unitsInVillage(map, tile)}/${villageCapacity(settlement.level)}`);
      bolds.push(true);
      if (settlement.owner !== null) {
        lines.push(`Income: ${villageIncome(map, tile)} money`);
        bolds.push(false);
      }
      if (settlement.owner === human.index) {
        const count = buildingsInVillage(map, tile);
        const limit = villageBuildingLimit(settlement.level);
        buildingLimitLineIndex = lines.length;
        lines.push(`Buildings: ${count}/${limit}`);
        bolds.push(false);
        if (count >= limit && settlement.level < 4) {
          lines.push(`Full — upgrade to level ${settlement.level + 1} for more building slots`);
          bolds.push(false);
        }
      }
    }

    if (tile.building) {
      const b = tile.building;
      const owner = tile.ownedBy !== null ? (s.players[tile.ownedBy] ?? null) : null;
      const y = buildingYield(map, tile, owner);
      buildingLineIndex = lines.length;
      lines.push(`${BUILDING_NAMES[b.kind]} (level ${b.level})`);
      bolds.push(true);
      if (y.wood > 0 || y.stone > 0 || y.ore > 0) {
        lines.push(`Produces: wood ${y.wood}, stone ${y.stone}, ore ${y.ore}`);
        bolds.push(false);
      }
    }

    const actions = this.suggestedSkillActions(tile, human);

    let maxW = 0;
    const lineH = 18;
    let y = 8;
    const lineWidths: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const t = makeLabel(lines[i]!, {
        fontSize: 13,
        fill: darkText ? 0x111111 : 0xeeeeee,
        fontWeight: bolds[i]! ? '700' : undefined
      });
      t.position.set(10, y);
      this.el.addChild(t);
      lineWidths[i] = t.width;
      maxW = Math.max(maxW, t.width);
      y += lineH;
    }
    for (const a of actions) {
      const btn = new Button({
        label: a.label,
        disabled: s.aiActive || !canOpenSkill(human, a.id),
        onClick: () => gameController.openSkill(a.id),
        paddingX: 10,
        paddingY: 4,
      });
      btn.position.set(10, y);
      this.el.addChild(btn);
      maxW = Math.max(maxW, btn.width);
      y += btn.height + 6;
    }
    this.measured = actions.length > 0 ? y - 6 + 8 : y + 8;

    const HELP_SIZE = 14;
    type HelpKind = 'unitHelp' | 'settlementHelp' | 'buildingHelp' | 'buildingLimitHelp';
    const helpRows: { index: number; kind: HelpKind }[] = [];
    if (tile.unit) helpRows.push({ index: unitLineIndex, kind: 'unitHelp' });
    if (tile.settlement) helpRows.push({ index: settlementLineIndex, kind: 'settlementHelp' });
    if (tile.building) helpRows.push({ index: buildingLineIndex, kind: 'buildingHelp' });
    if (buildingLimitLineIndex >= 0) helpRows.push({ index: buildingLimitLineIndex, kind: 'buildingLimitHelp' });

    let contentW = maxW;
    for (const row of helpRows) {
      contentW = Math.max(contentW, lineWidths[row.index]! + 6 + HELP_SIZE);
    }
    const bgW = contentW + 20;
    const bg = makePanel(bgW, this.measured, { fill: terrainColor, alpha: 1, rightRadiusOnly: true });
    bg.position.set(0, 0);
    this.el.addChildAt(bg, 0);

    for (const row of helpRows) {
      const btn = new Container();
      const circle = new Graphics();
      circle
        .circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2)
        .fill({ color: 0x000000, alpha: 0.7 });
      const mark = makeLabel('?', { fontSize: 11, fill: 0xffffff, fontWeight: '800' });
      mark.anchor.set(0.5, 0.5);
      mark.position.set(HELP_SIZE / 2, HELP_SIZE / 2);
      btn.addChild(circle, mark);
      btn.eventMode = 'static';
      btn.cursor = 'pointer';
      btn.hitArea = new Circle(HELP_SIZE / 2, HELP_SIZE / 2, HELP_SIZE / 2);
      btn.on('pointertap', () => useGameStore.getState().setOverlay({ kind: row.kind }));
      btn.position.set(10 + lineWidths[row.index]! + 6, 8 + row.index * lineH + (lineH - HELP_SIZE) / 2);
      this.el.addChild(btn);
    }

    this.layout();
  }

  private suggestedSkillActions(tile: MapTile, human: Player): { id: SkillId; label: string }[] {
    const actions: { id: SkillId; label: string }[] = [];
    if (isMountainType(tile.terrain)) {
      if (!hasSkill(human, 'climbing')) actions.push({ id: 'climbing', label: 'Open Climbing' });
      else if (!hasSkill(human, 'smithery')) actions.push({ id: 'smithery', label: 'Open Smithery' });
      return actions;
    }
    if (isWaterType(tile.terrain)) {
      if (!hasSkill(human, 'water')) actions.push({ id: 'water', label: 'Open Water' });
      else {
        if (!hasSkill(human, 'waterTemples')) actions.push({ id: 'waterTemples', label: 'Open Water Temples' });
        if (!hasSkill(human, 'navigation')) actions.push({ id: 'navigation', label: 'Open Navigation' });
      }
      return actions;
    }
    const map = gameController.getMap();
    const nearForest = isForestType(tile.terrain) || hexNeighbors(tile).some((n) => {
      const t = map ? tileAt(map, n.q, n.r) : undefined;
      return t !== undefined && isForestType(t.terrain);
    });
    if (nearForest && !hasSkill(human, 'forestry')) {
      actions.push({ id: 'forestry', label: 'Open Forestry' });
    } else if (isForestType(tile.terrain) && hasSkill(human, 'forestry') && !hasSkill(human, 'forestTemple')) {
      actions.push({ id: 'forestTemple', label: 'Open Forest Temples' });
    }
    return actions;
  }

  destroy(): void {
    if (this.unsub) this.unsub();
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.unsub = null;
    this.onResize = null;
    this.el?.destroy({ children: true });
    this.el = null;
    this.host = null;
  }
}
